'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { searchFaceByImage, getLivenessSessionResults } = require('../../utils/rekognition');
const { resolveKioskScope } = require('./officeKiosk.service');
const { applyAttendancePunch } = require('./attendance.service');

// AWS recommends ~90 as the pass bar for Face Liveness's own 0-100
// confidence score. Anything below is treated exactly like a failed local
// liveness challenge used to be — a plain rejection, not a soft flag (the
// old "Fraud Attempts" review queue was removed alongside the old custom
// anti-spoof model; AWS's decision is authoritative here).
// Lowered from AWS's suggested 90 after real testing: a genuine person on a
// normal laptop webcam consistently scored 77-80 (status still SUCCEEDED
// every time — AWS's own spoof check already passed, this is purely the
// confidence number), which was causing false rejections of a real employee.
// 70 keeps a wide safety margin below that — an actual photo/screen spoof
// typically scores well under 50 — while no longer rejecting normal users.
const LIVENESS_CONFIDENCE_THRESHOLD = 70;

// Similarity floor to accept a match, and a minimum gap the runner-up
// candidate must trail by — same anti-ambiguity principle as the old
// embedding-distance matcher, just on Rekognition's 0-100 Similarity score
// (higher = closer) instead of Euclidean distance (lower = closer).
const MATCH_SIMILARITY_THRESHOLD = 92;
const AMBIGUITY_MARGIN = 5;

function pickBestMatch(faceMatches) {
  if (!faceMatches.length) return null;

  // AWS returns FaceMatches already sorted by Similarity descending.
  const [best, runnerUp] = faceMatches;
  if (best.Similarity < MATCH_SIMILARITY_THRESHOLD) return null;
  if (runnerUp && best.Similarity - runnerUp.Similarity < AMBIGUITY_MARGIN) return null;

  return { faceId: best.Face.FaceId, similarity: best.Similarity };
}

async function checkInWithFace({ companyId, kioskUserId, action, sessionId, confirmIncompleteShift = false }) {
  if (action !== 'checkin' && action !== 'checkout') {
    throw new HttpError(400, "action must be 'checkin' or 'checkout'");
  }
  if (!sessionId) throw new HttpError(400, 'sessionId is required');

  const liveness = await getLivenessSessionResults(sessionId);
  // Temporary diagnostic while tuning LIVENESS_CONFIDENCE_THRESHOLD against
  // real webcam/lighting conditions — not sensitive (just a status + number).
  console.log(`[face-liveness] session=${sessionId} status=${liveness.status} confidence=${liveness.confidence}`);
  if (liveness.status !== 'SUCCEEDED' || !liveness.referenceImage) {
    throw new HttpError(400, 'Liveness check failed — please try again.');
  }
  if (liveness.confidence == null || liveness.confidence < LIVENESS_CONFIDENCE_THRESHOLD) {
    throw new HttpError(
      403,
      'Liveness check failed — this looks like a photo, video, or screen, not a live person. Please contact HR.',
      'SPOOF_DETECTED'
    );
  }

  const { brandId: kioskBrandId } = await resolveKioskScope({ userId: kioskUserId, companyId });

  const faceMatches = await searchFaceByImage({ companyId, imageBuffer: liveness.referenceImage });
  const match = pickBestMatch(faceMatches);
  if (!match) throw new HttpError(401, 'Face not recognized. Please try again or contact HR.');

  const profile = await db.EmployeeFaceProfile.findOne({
    where: { companyId, rekognitionFaceId: match.faceId, status: 'active' },
    include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'brandId', 'name', 'employeeCode'] }],
  });
  // No local row for this FaceId, or the employee behind it is gone — treat
  // identically to "no match" rather than a 500, and identically to a
  // brand-scope mismatch below, so a kiosk can't distinguish "unknown face"
  // from "a real employee outside my scope" by response shape.
  if (!profile || !profile.employee) throw new HttpError(401, 'Face not recognized. Please try again or contact HR.');
  if (kioskBrandId && String(profile.employee.brandId) !== String(kioskBrandId)) {
    throw new HttpError(401, 'Face not recognized. Please try again or contact HR.');
  }

  const result = await applyAttendancePunch({
    employeeId: profile.employeeId,
    now: new Date(),
    source: 'face',
    kioskUserId,
    action,
    confirmIncompleteShift,
  });

  // Best-effort, fire-and-forget — never blocks the punch response.
  db.EmployeeFaceProfile.update({ lastMatchedAt: new Date() }, { where: { employeeId: profile.employeeId } }).catch(
    (err) => console.error('face profile last_matched_at update failed:', err)
  );

  return {
    ...result,
    employee: { id: profile.employeeId, name: profile.employee.name, employeeCode: profile.employee.employeeCode },
  };
}

module.exports = { checkInWithFace };

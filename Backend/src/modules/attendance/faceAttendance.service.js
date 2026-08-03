'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { euclideanDistance, assertValidEmbedding } = require('./faceProfile.service');
const { loadCompanyFaceProfiles } = require('./faceCache');
const { resolveKioskScope } = require('./officeKiosk.service');
const { applyAttendancePunch } = require('./attendance.service');

// Distance ceiling to accept a match, and a minimum gap the runner-up
// candidate must trail by — rejects both "nobody's close enough" and
// "two people are too close to call" rather than guessing on either.
const MATCH_THRESHOLD = 0.5;
const AMBIGUITY_MARGIN = 0.07;

const MIN_FRAMES = 8;
const MIN_BURST_MS = 1200;
const MAX_BURST_MS = 6000;
const BLINK_EAR_THRESHOLD = 0.22;
const YAW_DELTA_THRESHOLD = 12;
const MIN_MOTION_STDDEV = 0.01; // near-zero variance across the burst means a frozen photo, not a live face

function stddev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Re-validated server-side from the numeric frame samples the kiosk sends
// (eye-aspect-ratio + yaw estimate per frame, computed client-side by
// face-api.js) — never trusts a bare "challenge passed" boolean from the
// browser. This defeats a static printed photo or a photo shown on a second
// screen (zero motion, no blink/turn possible on command); it does NOT
// defeat a pre-recorded video of the real person performing the exact
// requested challenge — a known, accepted limitation (see CLAUDE.md rule 6).
function validateLiveness({ challenge, frames }) {
  if (!Array.isArray(frames) || frames.length < MIN_FRAMES) {
    throw new HttpError(400, 'Liveness check failed — please try again.');
  }

  const span = frames[frames.length - 1].t - frames[0].t;
  if (span < MIN_BURST_MS || span > MAX_BURST_MS) {
    throw new HttpError(400, 'Liveness check failed — please try again.');
  }

  const ears = frames.map((f) => f.ear);
  const yaws = frames.map((f) => f.yaw);
  if (stddev(ears) < MIN_MOTION_STDDEV && stddev(yaws) < MIN_MOTION_STDDEV) {
    throw new HttpError(400, 'No motion detected — please use a live camera, not a photo.');
  }

  if (challenge === 'blink') {
    const dipped = ears.some((e) => e < BLINK_EAR_THRESHOLD);
    const recovered = ears[ears.length - 1] >= BLINK_EAR_THRESHOLD;
    if (!dipped || !recovered) throw new HttpError(400, 'Blink not detected — please try again.');
  } else if (challenge === 'turn_left' || challenge === 'turn_right') {
    const baseline = yaws[0];
    const extremum = challenge === 'turn_left' ? Math.min(...yaws) : Math.max(...yaws);
    if (Math.abs(extremum - baseline) < YAW_DELTA_THRESHOLD) {
      throw new HttpError(400, 'Head turn not detected — please try again.');
    }
  } else {
    throw new HttpError(400, 'Unknown liveness challenge.');
  }
}

function matchFaceEmbedding(candidates, embedding) {
  let best = null;
  let secondBestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = Math.min(...candidate.embeddings.map((e) => euclideanDistance(e, embedding)));
    if (!best || distance < best.distance) {
      secondBestDistance = best ? best.distance : secondBestDistance;
      best = { employeeId: candidate.employeeId, name: candidate.name, employeeCode: candidate.employeeCode, distance };
    } else if (distance < secondBestDistance) {
      secondBestDistance = distance;
    }
  }

  if (!best || best.distance > MATCH_THRESHOLD) return null;
  if (secondBestDistance - best.distance < AMBIGUITY_MARGIN) return null;
  return best;
}

async function checkInWithFace({ companyId, kioskUserId, action, embedding, liveness }) {
  if (action !== 'checkin' && action !== 'checkout') {
    throw new HttpError(400, "action must be 'checkin' or 'checkout'");
  }
  assertValidEmbedding('captured', embedding);
  validateLiveness(liveness || {});

  const { brandId: kioskBrandId } = await resolveKioskScope({ userId: kioskUserId, companyId });
  const allCandidates = await loadCompanyFaceProfiles(companyId);
  const candidates = kioskBrandId ? allCandidates.filter((c) => c.brandId === String(kioskBrandId)) : allCandidates;

  const match = matchFaceEmbedding(candidates, embedding);
  if (!match) throw new HttpError(401, 'Face not recognized. Please try again or contact HR.');

  const result = await applyAttendancePunch({
    employeeId: match.employeeId,
    now: new Date(),
    source: 'face',
    kioskUserId,
  });

  // Best-effort, fire-and-forget — never blocks the punch response.
  db.EmployeeFaceProfile.update({ lastMatchedAt: new Date() }, { where: { employeeId: match.employeeId } }).catch(
    (err) => console.error('face profile last_matched_at update failed:', err)
  );

  return { ...result, employee: { id: match.employeeId, name: match.name, employeeCode: match.employeeCode } };
}

module.exports = { checkInWithFace, matchFaceEmbedding, validateLiveness };

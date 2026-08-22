'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { euclideanDistance, assertValidEmbedding } = require('./faceProfile.service');
const { loadCompanyFaceProfiles } = require('./faceCache');
const { resolveKioskScope } = require('./officeKiosk.service');
const { applyAttendancePunch } = require('./attendance.service');
const { runAntiSpoofCheck } = require('./antiSpoof.service');
const { detectScreenArtifacts } = require('./screenArtifact.service');

// Distance ceiling to accept a match, and a minimum gap the runner-up
// candidate must trail by — rejects both "nobody's close enough" and
// "two people are too close to call" rather than guessing on either.
const MATCH_THRESHOLD = 0.5;
const AMBIGUITY_MARGIN = 0.07;

const MIN_FRAMES = 8;
const MIN_BURST_MS = 1200;
// KioskPage.tsx gives the employee up to 10s to perform the challenge
// (MAX_CAPTURE_MS there) — this used to be 6000, silently rejecting anyone
// who took more than 6s to react even though the UI showed a 10s countdown.
// 11000 gives a small buffer over the frontend's own 10000 ceiling for
// sampling-loop/network timing slop.
const MAX_BURST_MS = 11000;
// Smile-ratio (mouth-width/jaw-width) delta, not eye-aspect-ratio/blink —
// glasses frequently distort or occlude eye-landmark detection, causing
// false liveness rejections for employees who wear them; this reads only
// the mouth and jaw outline. See KioskPage.tsx's identical client-side copy
// (SMILE_DELTA_THRESHOLD there, kept in sync with this value).
const SMILE_DELTA_THRESHOLD = 0.06;
const YAW_DELTA_THRESHOLD = 12;
const MIN_MOTION_STDDEV = 0.01; // near-zero variance across the burst means a frozen photo, not a live face

// Conservative — this heuristic is uncalibrated (no labelled sample set in
// this environment), so it's deliberately set high enough to only flag
// clear cases rather than generate noise. See screenArtifact.service.js.
const SCREEN_ARTIFACT_SUSPICION_THRESHOLD = 0.6;

function stddev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Re-validated server-side from the numeric frame samples the kiosk sends
// (smile-ratio + yaw estimate per frame, computed client-side by
// face-api.js) — never trusts a bare "challenge passed" boolean from the
// browser. This defeats a static printed photo or a photo shown on a second
// screen (zero motion, no smile/turn possible on command); it does NOT
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

  const smiles = frames.map((f) => f.smile);
  const yaws = frames.map((f) => f.yaw);
  if (stddev(smiles) < MIN_MOTION_STDDEV && stddev(yaws) < MIN_MOTION_STDDEV) {
    throw new HttpError(400, 'No motion detected — please use a live camera, not a photo.');
  }

  if (challenge === 'smile') {
    const baseline = smiles[0];
    if (Math.max(...smiles) - baseline < SMILE_DELTA_THRESHOLD) {
      throw new HttpError(400, 'Smile not detected — please try again.');
    }
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

function createFlag(fields) {
  return db.FaceVerificationFlag.create(fields);
}

// Runs the anti-spoof model (hard signal) and, only if that passes, the
// screen-artifact heuristic (soft signal) against the kiosk's captured
// frame. Never throws for a processing failure (corrupt frame, decode
// error) — that's treated as "inconclusive", logged, and the punch is
// allowed to proceed on the strength of the existing motion-liveness check
// alone, same as before this feature existed. It DOES throw (with a
// flagId attached) when the model itself confidently says spoof and
// enforcement is on for this company — see the call site below.
async function runSpoofDefense({ companyId, kioskUserId, action, employeeId, frameImage, frameBbox, enforced }) {
  if (!frameImage || !frameBbox) return { flaggedButAllowed: null };

  let antiSpoof;
  try {
    antiSpoof = await runAntiSpoofCheck(frameImage, frameBbox);
  } catch (err) {
    console.error('anti-spoof check failed (treated as inconclusive):', err);
    return { flaggedButAllowed: null };
  }

  if (!antiSpoof.isReal) {
    const flag = await createFlag({
      companyId,
      kioskUserId,
      action,
      employeeId,
      reason: 'anti_spoof_model',
      blocked: enforced,
      realLogit: antiSpoof.realLogit,
      spoofLogit: antiSpoof.spoofLogit,
      antiSpoofConfidence: antiSpoof.confidence,
    });

    if (enforced) {
      const err = new HttpError(
        403,
        'Liveness check failed — this looks like a photo, video, or screen, not a live person. Please contact HR.',
        'SPOOF_DETECTED'
      );
      err.flagId = flag.id;
      throw err;
    }
    return { flaggedButAllowed: flag };
  }

  try {
    const screenArtifact = await detectScreenArtifacts(frameImage, frameBbox);
    if (screenArtifact.suspicionScore >= SCREEN_ARTIFACT_SUSPICION_THRESHOLD) {
      const flag = await createFlag({
        companyId,
        kioskUserId,
        action,
        employeeId,
        reason: 'screen_artifact',
        blocked: false,
        screenArtifactScore: screenArtifact.suspicionScore,
      });
      return { flaggedButAllowed: flag };
    }
  } catch (err) {
    console.error('screen-artifact check failed (non-blocking, ignored):', err);
  }

  return { flaggedButAllowed: null };
}

async function checkInWithFace({
  companyId,
  kioskUserId,
  action,
  embedding,
  liveness,
  frameImage,
  frameBbox,
  confirmIncompleteShift = false,
}) {
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

  // Only relevant once we know *who* the frame is claiming to be — this is
  // specifically the "a real registered employee's photo/video/screen
  // fools the embedding match" attack, not the "unknown face" case above.
  const company = await db.Company.findByPk(companyId, { attributes: ['id', 'faceAntispoofEnforced'] });
  const { flaggedButAllowed } = await runSpoofDefense({
    companyId,
    kioskUserId,
    action,
    employeeId: match.employeeId,
    frameImage,
    frameBbox,
    enforced: Boolean(company?.faceAntispoofEnforced),
  });

  const result = await applyAttendancePunch({
    employeeId: match.employeeId,
    now: new Date(),
    source: 'face',
    kioskUserId,
    action,
    confirmIncompleteShift,
  });

  if (flaggedButAllowed) {
    flaggedButAllowed.update({ attendanceId: result.attendance.id }).catch((err) =>
      console.error('face flag attendance_id backfill failed:', err)
    );
  }

  // Best-effort, fire-and-forget — never blocks the punch response.
  db.EmployeeFaceProfile.update({ lastMatchedAt: new Date() }, { where: { employeeId: match.employeeId } }).catch(
    (err) => console.error('face profile last_matched_at update failed:', err)
  );

  return { ...result, employee: { id: match.employeeId, name: match.name, employeeCode: match.employeeCode } };
}

module.exports = { checkInWithFace, matchFaceEmbedding, validateLiveness };

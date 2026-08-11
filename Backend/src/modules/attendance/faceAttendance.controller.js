'use strict';

const service = require('./faceAttendance.service');

// frameImage arrives as a data URL ("data:image/jpeg;base64,...") — the
// anti-spoof/screen-artifact pipeline (antiSpoof.service.js,
// screenArtifact.service.js) works on raw image bytes via sharp, so it's
// decoded once here rather than in the service layer.
function decodeFrameImage(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return null;
  try {
    return Buffer.from(dataUrl.slice(commaIndex + 1), 'base64');
  } catch {
    return null;
  }
}

async function faceCheckIn(req, res, next) {
  try {
    const { action, embedding, liveness, frameImage, frameBbox, confirmIncompleteShift } = req.body;
    const result = await service.checkInWithFace({
      companyId: req.auth.companyId,
      kioskUserId: req.auth.userId,
      action,
      embedding,
      liveness,
      frameImage: decodeFrameImage(frameImage),
      frameBbox,
      confirmIncompleteShift: Boolean(confirmIncompleteShift),
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { faceCheckIn };

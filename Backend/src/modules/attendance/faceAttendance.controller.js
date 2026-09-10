'use strict';

const service = require('./faceAttendance.service');

async function faceCheckIn(req, res, next) {
  try {
    const { action, sessionId, confirmIncompleteShift } = req.body;
    const result = await service.checkInWithFace({
      kioskUserId: req.auth.userId,
      // Identifies which physical device (of the several sharing this one
      // group kiosk login) is punching, and so which location to stamp on
      // the attendance row.
      kioskSessionId: req.get('X-Kiosk-Session') || req.body.kioskSessionId || null,
      action,
      sessionId,
      confirmIncompleteShift: Boolean(confirmIncompleteShift),
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { faceCheckIn };

'use strict';

const service = require('./faceAttendance.service');

async function faceCheckIn(req, res, next) {
  try {
    const { action, sessionId, confirmIncompleteShift } = req.body;
    const result = await service.checkInWithFace({
      companyId: req.auth.companyId,
      kioskUserId: req.auth.userId,
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

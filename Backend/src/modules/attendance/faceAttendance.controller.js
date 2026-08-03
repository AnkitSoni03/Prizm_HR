'use strict';

const service = require('./faceAttendance.service');

async function faceCheckIn(req, res, next) {
  try {
    const { action, embedding, liveness } = req.body;
    const result = await service.checkInWithFace({
      companyId: req.auth.companyId,
      kioskUserId: req.auth.userId,
      action,
      embedding,
      liveness,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { faceCheckIn };

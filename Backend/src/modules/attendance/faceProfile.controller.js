'use strict';

const service = require('./faceProfile.service');

async function register(req, res, next) {
  try {
    const result = await service.registerFaceProfile({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      embeddings: req.body.embeddings,
      photoObjectPaths: req.body.photoObjectPaths,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function myStatus(req, res, next) {
  try {
    const result = await service.getMyFaceProfileStatus({ employeeId: req.auth.employeeId });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, myStatus };

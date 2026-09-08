'use strict';

const service = require('./faceProfile.service');
const { HttpError } = require('../../utils/errors');

async function register(req, res, next) {
  try {
    if (!req.file) throw new HttpError(400, 'A photo is required to register your face');
    const result = await service.registerFaceProfile({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      imageBuffer: req.file.buffer,
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

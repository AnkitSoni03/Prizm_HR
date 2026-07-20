'use strict';

const service = require('./employeeDevice.service');

async function registrationOptions(req, res, next) {
  try {
    const options = await service.getRegistrationOptions({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
    });
    res.json({ data: options });
  } catch (err) {
    next(err);
  }
}

async function register(req, res, next) {
  try {
    const { deviceFingerprint, registrationResponse } = req.body;
    if (!deviceFingerprint || !registrationResponse) {
      return res.status(400).json({ error: 'deviceFingerprint and registrationResponse are required' });
    }

    const device = await service.registerDevice({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      deviceFingerprint,
      registrationResponse,
    });
    res.status(201).json({ data: device });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const devices = await service.listDevices({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
    });
    res.json({ data: devices });
  } catch (err) {
    next(err);
  }
}

async function revoke(req, res, next) {
  try {
    const device = await service.revokeDevice({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      id: req.params.id,
    });
    res.json({ data: device });
  } catch (err) {
    next(err);
  }
}

module.exports = { registrationOptions, register, list, revoke };

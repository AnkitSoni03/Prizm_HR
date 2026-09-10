'use strict';

const service = require('./officeKiosk.service');
const locationService = require('./kioskLocation.service');

// Every device running this kiosk account sends its own opaque session id
// (minted server-side at claim time, kept in that device's localStorage) so
// the backend can tell two devices sharing one login apart — the User id
// alone can't, it's shared.
function sessionIdFrom(req) {
  return req.get('X-Kiosk-Session') || req.body?.kioskSessionId || req.query.kioskSessionId || null;
}

// ---------------------------------------------------------------------------
// Kiosk-side (Scanner account authenticates as itself)
// ---------------------------------------------------------------------------

async function uploadFaceCapture(req, res, next) {
  try {
    const { action } = req.query;
    if (!req.file) return res.status(400).json({ error: 'video file is required' });

    const { companyIds } = await service.resolveKioskScope({ userId: req.auth.userId });
    const result = await service.uploadFaceCapture({
      companyIds,
      kioskUserId: req.auth.userId,
      attendanceId: req.params.attendanceId,
      action,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// The location picker shown right under the email/password fields on the
// kiosk sign-in screen. Only locations no *other* live device is running as
// come back — that is the "don't show a location that's already logged in
// elsewhere" rule.
async function listMyLocations(req, res, next) {
  try {
    await service.resolveKioskScope({ userId: req.auth.userId });
    const result = await locationService.listSelectableLocations({
      kioskUserId: req.auth.userId,
      sessionId: sessionIdFrom(req),
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function claimLocation(req, res, next) {
  try {
    await service.resolveKioskScope({ userId: req.auth.userId });
    const result = await locationService.claimLocation({
      kioskUserId: req.auth.userId,
      locationId: req.body.locationId,
      sessionId: sessionIdFrom(req),
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function heartbeatLocation(req, res, next) {
  try {
    const result = await locationService.heartbeatLocation({
      kioskUserId: req.auth.userId,
      sessionId: sessionIdFrom(req),
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function releaseLocation(req, res, next) {
  try {
    const result = await locationService.releaseLocation({
      kioskUserId: req.auth.userId,
      sessionId: sessionIdFrom(req),
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Super Admin only (structural requireSuperAdmin gate, not a permission code)
// ---------------------------------------------------------------------------

async function createKioskAccount(req, res, next) {
  try {
    const result = await service.createKioskAccount({
      groupId: req.body.groupId,
      email: req.body.email,
      password: req.body.password,
      locations: req.body.locations,
    });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function listKioskAccounts(req, res, next) {
  try {
    const result = await service.listKioskAccounts({ groupId: req.query.groupId });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateKioskAccountLocations(req, res, next) {
  try {
    const result = await service.updateKioskAccountLocations({
      groupId: req.body.groupId,
      userId: req.params.id,
      locations: req.body.locations,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function resetKioskAccountPassword(req, res, next) {
  try {
    const result = await service.resetKioskAccountPassword({
      groupId: req.body.groupId,
      userId: req.params.id,
      password: req.body.password,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getKioskAccountPassword(req, res, next) {
  try {
    const result = await service.getKioskAccountPassword({
      groupId: req.query.groupId,
      userId: req.params.id,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function deleteKioskAccount(req, res, next) {
  try {
    const result = await service.deleteKioskAccount({ groupId: req.query.groupId, userId: req.params.id });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadFaceCapture,
  listMyLocations,
  claimLocation,
  heartbeatLocation,
  releaseLocation,
  createKioskAccount,
  listKioskAccounts,
  updateKioskAccountLocations,
  resetKioskAccountPassword,
  getKioskAccountPassword,
  deleteKioskAccount,
};

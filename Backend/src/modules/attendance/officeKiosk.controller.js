'use strict';

const service = require('./officeKiosk.service');
const { requireCompanyScope, resolveCompanyScope } = require('../../utils/resolveCompanyScope');
const { getSubscriber } = require('../../config/redisSubscriber');

const HEARTBEAT_INTERVAL_MS = 20000;

async function issueOfficeToken(req, res, next) {
  try {
    const result = await service.issueOfficeToken({ userId: req.auth.userId, companyId: req.auth.companyId });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function verifyOfficeQr(req, res, next) {
  try {
    const { officeToken, action } = req.body;
    if (!officeToken || !action) {
      return res.status(400).json({ error: 'officeToken and action are required' });
    }
    const result = await service.verifyOfficeQr({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      officeToken,
      action,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function verifyOfficeBiometric(req, res, next) {
  try {
    const { pendingAttendanceId, webauthnAssertion } = req.body;
    if (!pendingAttendanceId || !webauthnAssertion) {
      return res.status(400).json({ error: 'pendingAttendanceId and webauthnAssertion are required' });
    }
    const result = await service.completeVerifyOfficeBiometric({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      pendingAttendanceId,
      webauthnAssertion,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function issueSseTicket(req, res, next) {
  try {
    const result = await service.issueSseTicket({ userId: req.auth.userId });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// Unauthenticated route (no requireAuth) — EventSource can't send an
// Authorization header, so this is guarded by the single-use ticket instead
// of a JWT. See officeToken.js/officeKiosk.service.js for why the ticket
// exists rather than putting the kiosk's real access token in the query
// string.
async function videoStream(req, res) {
  const { ticket } = req.query;
  let kioskUserId;
  try {
    ({ kioskUserId } = await service.consumeSseTicket(ticket));
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message || 'Invalid ticket' });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const subscriber = getSubscriber();
  const channel = service.videoTriggerChannel(kioskUserId);

  const onMessage = (receivedChannel, message) => {
    if (receivedChannel !== channel) return;
    res.write(`data: ${message}\n\n`);
  };
  subscriber.on('message', onMessage);
  await subscriber.subscribe(channel);

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_INTERVAL_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscriber.off('message', onMessage);
    subscriber.unsubscribe(channel).catch((err) => console.error('SSE unsubscribe failed:', err.message));
  });
}

async function uploadVideo(req, res, next) {
  try {
    const { action } = req.query;
    if (!req.file) return res.status(400).json({ error: 'video file is required' });

    const result = await service.uploadOfficeVideo({
      companyId: req.auth.companyId,
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

async function createScannerAccount(req, res, next) {
  try {
    const companyId = requireCompanyScope({ authCompanyId: req.auth.companyId, override: req.body.companyId });
    const brandId = req.auth.scopedBrandIds ? req.body.brandId : req.body.brandId || null;
    if (req.auth.scopedBrandIds && (!brandId || !req.auth.scopedBrandIds.some((id) => String(id) === String(brandId)))) {
      return res.status(403).json({ error: 'Forbidden', permission: 'scanner_account:create' });
    }

    const result = await service.createScannerAccount({
      companyId,
      brandId,
      email: req.body.email,
      password: req.body.password,
    });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function listScannerAccounts(req, res, next) {
  try {
    const companyId = resolveCompanyScope({ authCompanyId: req.auth.companyId, override: req.query.companyId });
    const brandId = req.auth.scopedBrandIds ? req.query.brandId || null : req.query.brandId || null;
    const result = await service.listScannerAccounts({ companyId, brandId });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  issueOfficeToken,
  verifyOfficeQr,
  verifyOfficeBiometric,
  issueSseTicket,
  videoStream,
  uploadVideo,
  createScannerAccount,
  listScannerAccounts,
};

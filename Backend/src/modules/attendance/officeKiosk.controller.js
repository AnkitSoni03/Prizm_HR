'use strict';

const service = require('./officeKiosk.service');
const { requireCompanyScope, resolveCompanyScope } = require('../../utils/resolveCompanyScope');

async function uploadFaceCapture(req, res, next) {
  try {
    const { action } = req.query;
    if (!req.file) return res.status(400).json({ error: 'video file is required' });

    const result = await service.uploadFaceCapture({
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
  uploadFaceCapture,
  createScannerAccount,
  listScannerAccounts,
};

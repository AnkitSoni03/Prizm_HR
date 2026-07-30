'use strict';

const service = require('./employeeDocument.service');

async function list(req, res, next) {
  try {
    const docs = await service.listDocuments({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
    });
    res.json({ data: docs });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const doc = await service.getDocument({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      id: req.params.id,
    });
    res.json({ data: await service.withDownloadUrl(doc) });
  } catch (err) {
    next(err);
  }
}

async function upload(req, res, next) {
  try {
    const { type } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'type is required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const doc = await service.uploadDocument({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      type,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    res.status(201).json({ data: doc });
  } catch (err) {
    next(err);
  }
}

async function verify(req, res, next) {
  try {
    const doc = await service.verifyDocument({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      id: req.params.id,
      verifiedByUserId: req.auth.userId,
    });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, upload, verify };

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
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
}

async function upload(req, res, next) {
  try {
    const { type, fileUrl } = req.body;
    if (!type || !fileUrl) {
      return res.status(400).json({ error: 'type and fileUrl are required' });
    }

    const doc = await service.uploadDocument({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      type,
      fileUrl,
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
    });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, upload, verify };

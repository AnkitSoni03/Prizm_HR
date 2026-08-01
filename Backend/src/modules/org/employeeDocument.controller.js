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

async function update(req, res, next) {
  try {
    const { type } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'type is required' });
    }

    const doc = await service.updateDocument({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      id: req.params.id,
      type,
    });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteDocument({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      id: req.params.id,
    });
    res.status(204).send();
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

async function reject(req, res, next) {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A reason is required to reject a document' });
    }

    const doc = await service.rejectDocument({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      id: req.params.id,
      rejectedByUserId: req.auth.userId,
      reason: reason.trim(),
    });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, upload, update, remove, verify, reject };

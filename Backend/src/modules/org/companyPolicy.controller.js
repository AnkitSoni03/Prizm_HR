'use strict';

const service = require('./companyPolicy.service');
const { parsePagination } = require('../../utils/pagination');
const { resolveCompanyScope, assertCompanyInCallerGroup } = require('../../utils/resolveCompanyScope');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    // Optional override, same as leaveRequest.controller.js/etc. — lets a
    // Group Admin's read-only company drill-in pass companyId explicitly
    // (their own companyId is always null).
    const companyId = resolveCompanyScope({
      authCompanyId: req.auth.companyId,
      override: req.query.companyId,
    });
    await assertCompanyInCallerGroup({ groupId: req.auth.groupId, companyId });

    const { rows, count } = await service.listCompanyPolicies({
      companyId,
      rosterGroupId: req.query.rosterGroupId,
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { title, body, rosterGroupIds } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const policy = await service.createCompanyPolicy({
      companyId: req.auth.companyId,
      title,
      body,
      rosterGroupIds,
      createdBy: req.auth.userId,
    });
    res.status(201).json({ data: policy });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const policy = await service.updateCompanyPolicy({
      companyId: req.auth.companyId,
      id: req.params.id,
      updates: req.body,
      updatedBy: req.auth.userId,
    });
    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteCompanyPolicy({
      companyId: req.auth.companyId,
      id: req.params.id,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function uploadAttachment(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const policy = await service.uploadPolicyAttachment({
      companyId: req.auth.companyId,
      id: req.params.id,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      updatedBy: req.auth.userId,
    });
    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove, uploadAttachment };

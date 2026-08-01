'use strict';

const service = require('./documentUploadRequest.service');

async function list(req, res, next) {
  try {
    const requests = await service.listRequests({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
    });
    res.json({ data: requests });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { documentType, note } = req.body;
    if (!documentType) {
      return res.status(400).json({ error: 'documentType is required' });
    }

    const request = await service.createRequest({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      scopedBrandIds: req.auth.scopedBrandIds,
      documentType,
      note,
      requestedByUserId: req.auth.userId,
    });
    res.status(201).json({ data: request });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const request = await service.cancelRequest({
      companyId: req.auth.companyId,
      id: req.params.id,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: request });
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    const request = await service.completeRequest({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      id: req.params.id,
    });
    res.json({ data: request });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, cancel, complete };

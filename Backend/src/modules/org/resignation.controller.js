'use strict';

const service = require('./resignation.service');
const { parsePagination } = require('../../utils/pagination');

const STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn'];

function statusFilter(query) {
  return STATUSES.includes(query.status) ? query.status : undefined;
}

async function submit(req, res, next) {
  try {
    if (!req.auth.employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }
    const resignation = await service.submitResignation({
      employeeId: req.auth.employeeId,
      reason: req.body.reason,
      requestedLastWorkingDate: req.body.lastWorkingDate || null,
    });
    res.status(201).json({ data: resignation });
  } catch (err) {
    next(err);
  }
}

async function withdraw(req, res, next) {
  try {
    if (!req.auth.employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }
    const resignation = await service.withdrawResignation({ employeeId: req.auth.employeeId, id: req.params.id });
    res.json({ data: resignation });
  } catch (err) {
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    if (!req.auth.employeeId) return res.json({ data: [], hr: null });
    const { rows, hr } = await service.listMyResignations({ employeeId: req.auth.employeeId });
    res.json({ data: rows, hr });
  } catch (err) {
    next(err);
  }
}

// req.resignationBrandScope: null = company-wide, array = brand-scoped.
async function listCompany(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listCompanyResignations({
      companyId: req.auth.companyId,
      brandIds: req.resignationBrandScope,
      status: statusFilter(req.query),
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function listTeam(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listTeamResignations({
      companyId: req.auth.companyId,
      callerEmployeeId: req.auth.employeeId,
      canReadReports: req.canReadReports,
      status: statusFilter(req.query),
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function decide(req, res, next) {
  try {
    const resignation = await service.decideResignation({
      auth: req.auth,
      id: req.params.id,
      action: req.body.action,
      comment: req.body.comment,
      lastWorkingDate: req.body.lastWorkingDate || null,
    });
    res.json({ data: resignation });
  } catch (err) {
    next(err);
  }
}

module.exports = { submit, withdraw, listMine, listCompany, listTeam, decide };

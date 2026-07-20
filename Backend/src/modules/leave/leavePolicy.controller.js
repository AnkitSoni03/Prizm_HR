'use strict';

const service = require('./leavePolicy.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listLeavePolicies({
      limit,
      offset,
      leaveTypeId: req.query.leaveTypeId,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { leaveTypeId, annualQuota, accrual, applicableAfterDays } = req.body;
    if (!leaveTypeId || annualQuota === undefined) {
      return res.status(400).json({ error: 'leaveTypeId and annualQuota are required' });
    }

    const policy = await service.createLeavePolicy({
      companyId: req.auth.companyId,
      leaveTypeId,
      annualQuota,
      accrual,
      applicableAfterDays,
    });
    res.status(201).json({ data: policy });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const policy = await service.updateLeavePolicy({
      companyId: req.auth.companyId,
      id: req.params.id,
      updates: req.body,
    });
    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update };

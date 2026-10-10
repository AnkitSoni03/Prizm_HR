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
      brandId: req.query.brandId,
      scopedBrandIds: req.auth.scopedBrandIds,
      // 'null' (string) in the query means "company-wide defaults only" —
      // an actual query param can't carry a real `null`.
      rosterGroupId: req.query.rosterGroupId === 'null' ? null : req.query.rosterGroupId,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { leaveTypeId, rosterGroupIds, annualQuota, isUnlimited, accrual, applicableAfterDays, brandId } = req.body;
    // annualQuota itself is validated in the service (it's not needed for
    // an Unlimited quota or a linked leave type).
    if (!leaveTypeId) {
      return res.status(400).json({ error: 'leaveTypeId is required' });
    }

    const policy = await service.createLeavePolicy({
      companyId: req.auth.companyId,
      brandId,
      scopedBrandIds: req.auth.scopedBrandIds,
      leaveTypeId,
      rosterGroupIds,
      annualQuota,
      isUnlimited: !!isUnlimited,
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
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: policy });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update };

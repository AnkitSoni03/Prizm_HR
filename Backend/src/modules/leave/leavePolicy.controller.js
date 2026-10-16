'use strict';

const db = require('../../models');
const service = require('./leavePolicy.service');
const { parsePagination } = require('../../utils/pagination');
const { normalizeCycleStartMonth } = require('../../utils/leavePeriod');

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

// Company default "Yearly Roster Update" — the month (1-12) the yearly leave
// cycle starts on (1 = Jan–Dec, 4 = Apr–Mar). Employees may override it on
// their profile. Leave balances renew on the 1st of that month (with capped
// carry-forward) — not during a Probation/Intern period. See
// utils/leavePeriod.js.
async function getYearlyCycle(req, res, next) {
  try {
    if (!req.auth.companyId) return res.status(400).json({ error: 'companyId is required' });
    const company = await db.Company.findByPk(req.auth.companyId, { attributes: ['id', 'yearlyCycleStartMonth'] });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ data: { yearlyCycleStartMonth: company.yearlyCycleStartMonth } });
  } catch (err) {
    next(err);
  }
}

// Company-wide, so a Brand-scoped admin (Brand Admin) can't change it.
async function updateYearlyCycle(req, res, next) {
  try {
    if (!req.auth.companyId) return res.status(400).json({ error: 'companyId is required' });
    if (req.auth.scopedBrandIds) {
      return res.status(403).json({ error: 'Only a company-wide admin can change the yearly cycle' });
    }
    const month = normalizeCycleStartMonth(req.body.yearlyCycleStartMonth);
    if (!month) return res.status(400).json({ error: 'yearlyCycleStartMonth must be a month number 1-12' });
    const company = await db.Company.findByPk(req.auth.companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    await company.update({ yearlyCycleStartMonth: month });
    res.json({ data: { yearlyCycleStartMonth: company.yearlyCycleStartMonth } });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, getYearlyCycle, updateYearlyCycle };

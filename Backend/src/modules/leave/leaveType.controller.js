'use strict';

const service = require('./leaveType.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listLeaveTypes({
      limit,
      offset,
      brandId: req.query.brandId,
      scopedBrandIds: req.auth.scopedBrandIds,
      rosterGroupId: req.query.rosterGroupId,
      employeeId: req.auth.employeeId,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const leaveType = await service.getLeaveTypeForRead(req.params.id);
    res.json({ data: leaveType });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const {
      code,
      name,
      isPaid,
      carryForward,
      maxCarryForwardDays,
      cycleType,
      defaultAccrual,
      customCycleStartMonth,
      customCycleStartDay,
      brandId,
      applicableGender,
    } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'code and name are required' });
    }

    const leaveType = await service.createLeaveType({
      companyId: req.auth.companyId,
      brandId,
      scopedBrandIds: req.auth.scopedBrandIds,
      code,
      name,
      isPaid,
      carryForward,
      maxCarryForwardDays,
      cycleType,
      defaultAccrual,
      customCycleStartMonth,
      customCycleStartDay,
      applicableGender,
    });
    res.status(201).json({ data: leaveType });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const leaveType = await service.updateLeaveType({
      companyId: req.auth.companyId,
      id: req.params.id,
      updates: req.body,
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.json({ data: leaveType });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteLeaveType({
      companyId: req.auth.companyId,
      id: req.params.id,
      force: req.query.force === 'true',
      scopedBrandIds: req.auth.scopedBrandIds,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };

'use strict';

const service = require('./leaveType.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listLeaveTypes({ limit, offset, rosterGroupId: req.query.rosterGroupId });
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
    const { code, name, isPaid, carryForward, maxCarryForwardDays, cycleType, defaultAccrual } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'code and name are required' });
    }

    const leaveType = await service.createLeaveType({
      companyId: req.auth.companyId,
      code,
      name,
      isPaid,
      carryForward,
      maxCarryForwardDays,
      cycleType,
      defaultAccrual,
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
    });
    res.json({ data: leaveType });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteLeaveType({ companyId: req.auth.companyId, id: req.params.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };

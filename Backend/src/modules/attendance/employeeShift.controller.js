'use strict';

const service = require('./employeeShift.service');

async function list(req, res, next) {
  try {
    const rows = await service.listEmployeeShifts({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { shiftId, effectiveFrom } = req.body;
    if (!shiftId || !effectiveFrom) {
      return res.status(400).json({ error: 'shiftId and effectiveFrom are required' });
    }

    const assignment = await service.createEmployeeShift({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      shiftId,
      effectiveFrom,
    });
    res.status(201).json({ data: assignment });
  } catch (err) {
    next(err);
  }
}

async function bulkCreate(req, res, next) {
  try {
    const { employeeIds, shiftId, effectiveFrom } = req.body;
    if (!Array.isArray(employeeIds) || employeeIds.length === 0 || !shiftId || !effectiveFrom) {
      return res.status(400).json({ error: 'employeeIds (non-empty array), shiftId and effectiveFrom are required' });
    }

    const results = await service.bulkCreateEmployeeShift({
      companyId: req.auth.companyId,
      employeeIds,
      shiftId,
      effectiveFrom,
    });
    res.status(201).json({ data: results });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteEmployeeShift({
      companyId: req.auth.companyId,
      employeeId: req.params.employeeId,
      id: req.params.id,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, bulkCreate, remove };

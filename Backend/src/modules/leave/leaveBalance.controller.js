'use strict';

const service = require('./leaveBalance.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listLeaveBalances({
      companyId: req.auth.companyId,
      employeeId: req.leaveBalanceEmployeeScope || req.query.employeeId,
      year: req.query.year,
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function adjust(req, res, next) {
  try {
    const { employeeId, leaveTypeId, year, allotted } = req.body;
    if (!employeeId || !leaveTypeId || !year || allotted === undefined) {
      return res.status(400).json({ error: 'employeeId, leaveTypeId, year and allotted are required' });
    }

    const balance = await service.adjustLeaveBalance({
      companyId: req.auth.companyId,
      employeeId,
      leaveTypeId,
      year,
      allotted,
    });
    res.json({ data: balance });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, adjust };

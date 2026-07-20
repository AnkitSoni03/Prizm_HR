'use strict';

const service = require('./payslip.service');
const { parsePagination } = require('../../utils/pagination');
const { HttpError } = require('../../utils/errors');

async function get(req, res, next) {
  try {
    const payslip = await service.getPayslipForRead({ companyId: req.auth.companyId, id: req.params.id });
    res.json({ data: payslip });
  } catch (err) {
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    if (req.auth.employeeId == null) throw new HttpError(403, 'No employee record for this account');
    const { limit, offset } = parsePagination(req.query);
    const { rows, count } = await service.listOwnPayslips({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      limit,
      offset,
    });
    res.json({ data: rows, pagination: { total: count, limit, offset } });
  } catch (err) {
    next(err);
  }
}

async function getMine(req, res, next) {
  try {
    if (req.auth.employeeId == null) throw new HttpError(403, 'No employee record for this account');
    const payslip = await service.getOwnPayslip({
      companyId: req.auth.companyId,
      employeeId: req.auth.employeeId,
      id: req.params.id,
    });
    res.json({ data: payslip });
  } catch (err) {
    next(err);
  }
}

module.exports = { get, listMine, getMine };

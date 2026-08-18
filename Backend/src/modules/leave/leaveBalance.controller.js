'use strict';

const service = require('./leaveBalance.service');
const { parsePagination } = require('../../utils/pagination');

async function list(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    // Own-scoped read (an employee viewing "My Leave Balance") — eagerly
    // materialize any applicable-but-not-yet-created balance rows first, so
    // a fresh Yearly Leave Policy shows its real quota immediately instead
    // of a misleading "0 / 0 / Exhausted" until the employee's first leave
    // application. Skipped for admin reads (req.leaveBalanceEmployeeScope
    // null) — no reason to eagerly seed every employee's balance on a
    // company-wide list view.
    if (req.leaveBalanceEmployeeScope) {
      await service.ensureBalancesForEmployee({ employeeId: req.leaveBalanceEmployeeScope, year: req.query.year });
    }
    const { rows, count } = await service.listLeaveBalances({
      companyId: req.auth.companyId,
      employeeId: req.leaveBalanceEmployeeScope || req.query.employeeId,
      year: req.query.year,
      limit,
      offset,
    });
    // Own-scoped read: attach each row's currently-governing accrual so the
    // employee can tell why their balance is what it is (see
    // leaveBalance.service.js::attachAccrualInfo). Admin reads are left as
    // plain LeaveBalance rows, unchanged.
    const data = req.leaveBalanceEmployeeScope
      ? await service.attachAccrualInfo(rows, req.leaveBalanceEmployeeScope)
      : rows;
    res.json({ data, pagination: { total: count, limit, offset } });
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

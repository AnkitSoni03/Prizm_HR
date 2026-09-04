'use strict';

const service = require('./leaveBalance.service');
const { parsePagination } = require('../../utils/pagination');
const { notifyUser } = require('../../utils/notifications');

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

// From the Employee Detail Modal's "Leaves" tab — edits multiple leave
// types' allotted balance for one employee in a single Save, then sends the
// employee one consolidated notification (only if something actually
// changed — see bulkAdjustLeaveBalances's own no-op-row skip).
async function bulkAdjust(req, res, next) {
  try {
    const { employeeId, adjustments } = req.body;
    if (!employeeId || !Array.isArray(adjustments) || adjustments.length === 0) {
      return res.status(400).json({ error: 'employeeId and a non-empty adjustments array are required' });
    }
    for (const entry of adjustments) {
      if (!entry.leaveTypeId || !entry.year || entry.allotted === undefined) {
        return res.status(400).json({ error: 'Each adjustment needs leaveTypeId, year and allotted' });
      }
    }

    const { employee, changes } = await service.bulkAdjustLeaveBalances({
      companyId: req.auth.companyId,
      employeeId,
      adjustments,
    });

    if (changes.length > 0) {
      const body = changes
        .map((c) => {
          const parts = [];
          if (c.previousAllotted !== c.newAllotted) parts.push(`allotted ${c.previousAllotted} → ${c.newAllotted}`);
          if (c.previousUsed !== c.newUsed) parts.push(`used ${c.previousUsed} → ${c.newUsed}`);
          return `${c.leaveTypeName}: ${parts.join(', ')}`;
        })
        .join('; ');
      await notifyUser({
        companyId: req.auth.companyId,
        userId: employee.userId,
        type: 'leave_balance_updated',
        title: 'Your leave balance was updated',
        body,
      });
    }

    res.json({ changed: changes.length });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, adjust, bulkAdjust };

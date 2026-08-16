'use strict';

const db = require('../../models');
const { HttpError } = require('../../utils/errors');
const { toBusinessLocal } = require('../../utils/dateRange');

// Monthly accrual is credited whole-month, not prorated by day-of-month: an
// employee who joins on the 20th still gets that month's full share.
// PHASE4_MODELS.md only calls for day-of-joining proration at the "which
// months count at all" level, not sub-month precision.
function monthsAccruedForYear({ year, dateOfJoining, asOf = toBusinessLocal() }) {
  const yearStart = new Date(year, 0, 1);
  const joinDate = dateOfJoining ? new Date(`${dateOfJoining}T00:00:00`) : null;
  const accrualStart = joinDate && joinDate > yearStart ? joinDate : yearStart;
  if (accrualStart.getFullYear() > year) return 0;

  const windowEnd = asOf.getFullYear() > year ? new Date(year, 11, 31) : asOf;
  if (windowEnd < accrualStart) return 0;

  const months = (windowEnd.getFullYear() - accrualStart.getFullYear()) * 12
    + (windowEnd.getMonth() - accrualStart.getMonth()) + 1;
  return Math.max(0, Math.min(12, months));
}

// Lazily creates the employee's leave_balances row for (leaveTypeId, year)
// from the company's leave_policies row the first time it's needed, rather
// than requiring a separate backfill step per PHASE4_MODELS.md's "at policy
// assignment / start of year" trigger. For accrual=monthly this seeds
// whatever should already have accrued as of today; the monthly cron
// (src/jobs/leaveAccrual.job.js) tops it up going forward.
async function getOrCreateBalance({ employeeId, leaveTypeId, year, transaction }) {
  let balance = await db.LeaveBalance.findOne({ where: { employeeId, leaveTypeId, year }, transaction });
  if (balance) return balance;

  const leaveType = await db.LeaveType.findOne({ where: { id: leaveTypeId }, transaction });
  const policy = leaveType
    ? await db.LeavePolicy.findOne({ where: { companyId: leaveType.companyId, leaveTypeId }, transaction })
    : null;

  let allotted = 0;
  if (policy) {
    if (policy.accrual === 'yearly') {
      allotted = Number(policy.annualQuota);
    } else if (policy.accrual === 'monthly_reset') {
      // Flat per-month amount, not divided/accumulated — the monthly cron
      // (leaveAccrual.job.js) resets this same amount every month.
      allotted = Number(policy.annualQuota);
    } else {
      const employee = await db.Employee.findOne({ where: { id: employeeId }, transaction });
      const monthlyAmount = Number(policy.annualQuota) / 12;
      const months = monthsAccruedForYear({ year, dateOfJoining: employee ? employee.dateOfJoining : null });
      allotted = Math.round(monthlyAmount * months * 100) / 100;
    }
  }

  try {
    balance = await db.LeaveBalance.create(
      { employeeId, leaveTypeId, year, allotted, used: 0, balance: allotted },
      { transaction }
    );
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      // Race: created concurrently by another request.
      balance = await db.LeaveBalance.findOne({ where: { employeeId, leaveTypeId, year }, transaction });
    } else {
      throw err;
    }
  }
  return balance;
}

async function listLeaveBalances({ companyId, employeeId, year, limit, offset }) {
  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (year) where.year = year;

  const { rows, count } = await db.LeaveBalance.findAndCountAll({
    where,
    limit,
    offset,
    order: [['year', 'DESC']],
    include: [
      { model: db.Employee, as: 'employee', where: { companyId }, attributes: ['id', 'employeeCode'] },
      { model: db.LeaveType, as: 'leaveType' },
    ],
  });
  return { rows, count };
}

// Manual correction (leave_balance:adjust) — sets allotted directly and
// recomputes balance from the existing used total.
async function adjustLeaveBalance({ companyId, employeeId, leaveTypeId, year, allotted }) {
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const balance = await getOrCreateBalance({ employeeId, leaveTypeId, year });
  await balance.update({ allotted, balance: Number(allotted) - Number(balance.used) });
  return balance;
}

module.exports = { getOrCreateBalance, listLeaveBalances, adjustLeaveBalance, monthsAccruedForYear };

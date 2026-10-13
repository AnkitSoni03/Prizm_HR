'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { addDays, datesBetween } = require('../../utils/dateRange');
const { isWorkingDay } = require('../../utils/workingDays');
const { normalizeRules } = require('./payrollRules');

// ---------------------------------------------------------------------------
// Sandwich rule (optional — salary template rules.sandwichRule). When an
// approved full-day leave and another approved full-day leave sit on either
// side of holidays / week-offs, those in-between days count as leave too:
//   Fri leave · Sat-Sun off · Mon leave  →  4 leave days, not 2.
// Each sandwiched day takes one day from the leave balance; with no balance
// left (or when the leaves are unpaid) the day becomes unpaid (LOP).
// Applied when the second leave is approved (so the balance is right
// straight away); undone when either surrounding leave is reverted.
// A day the employee actually worked is never sandwiched.
// ---------------------------------------------------------------------------

const MAX_GAP_DAYS = 10;
const WORKED = new Set(['present', 'on_duty', 'half_day']);

async function sandwichRuleOn(employeeId, dateStr, transaction) {
  const assignment = await db.SalaryAssignment.findOne({
    where: {
      employeeId,
      effectiveFrom: { [Op.lte]: dateStr },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: dateStr } }],
    },
    include: [{ model: db.PayrollTemplate, as: 'template' }],
    order: [['effectiveFrom', 'DESC']],
    transaction,
  });
  if (!assignment || !assignment.template) return false;
  return normalizeRules(assignment.template.rules).sandwichRule;
}

function chargeableTypeOf(request) {
  const type = request.leaveType;
  if (!type || !type.isPaid || type.code === 'CO') return null;
  return request.balanceLeaveTypeId || request.leaveTypeId;
}

// The approved full-day leave (other than `excludeId`) covering a date.
async function fullDayLeaveOn(employeeId, date, excludeId, transaction) {
  return db.LeaveRequest.findOne({
    where: {
      employeeId,
      id: { [Op.ne]: excludeId },
      status: 'approved',
      halfDaySession: null,
      fromDate: { [Op.lte]: date },
      toDate: { [Op.gte]: date },
    },
    include: [{ model: db.LeaveType, as: 'leaveType' }],
    transaction,
  });
}

// Walks from `startDate` in `step` (-1/+1) over non-working days. Returns
// { gap: [dates], edge: first working date reached } or null if it runs past
// MAX_GAP_DAYS.
async function walkGap(employee, startDate, step) {
  const gap = [];
  let date = startDate;
  for (let i = 0; i < MAX_GAP_DAYS; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const working = await isWorkingDay({
      employeeId: employee.id,
      companyId: employee.companyId,
      brandId: employee.brandId,
      rosterGroupId: employee.rosterGroupId,
      dateStr: date,
    });
    if (working) return { gap, edge: date };
    gap.push(date);
    date = addDays(date, step);
  }
  return null;
}

// Called inside the approval transaction (leaveRequest.service.js::
// applyLeaveApprovalSideEffects). `request` has employee + leaveType loaded.
// Returns the sandwiched dates (for the payroll recalculation range).
async function applySandwichOnApproval({ request, transaction }) {
  if (request.halfDaySession) return [];
  const employee = request.employee;
  if (!(await sandwichRuleOn(employee.id, request.fromDate, transaction))) return [];

  const rangeDates = datesBetween(request.fromDate, request.toDate);
  const workingFlags = [];
  for (const date of rangeDates) {
    // eslint-disable-next-line no-await-in-loop
    workingFlags.push(await isWorkingDay({
      employeeId: employee.id,
      companyId: employee.companyId,
      brandId: employee.brandId,
      rosterGroupId: employee.rosterGroupId,
      dateStr: date,
    }));
  }
  const firstWorking = rangeDates[workingFlags.indexOf(true)];
  const lastWorking = rangeDates[workingFlags.lastIndexOf(true)];
  if (!firstWorking) return [];

  // [{ date, other }] — `other` = the leave on the far side (the request
  // itself for days inside its own range).
  const candidates = [];
  rangeDates.forEach((date, i) => {
    if (!workingFlags[i] && date > firstWorking && date < lastWorking) candidates.push({ date, other: request });
  });
  for (const [from, step] of [[addDays(firstWorking, -1), -1], [addDays(lastWorking, 1), 1]]) {
    // eslint-disable-next-line no-await-in-loop
    const walk = await walkGap(employee, from, step);
    if (!walk || walk.gap.length === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const other = await fullDayLeaveOn(employee.id, walk.edge, request.id, transaction);
    if (!other) continue;
    for (const date of walk.gap) candidates.push({ date, other });
  }
  if (candidates.length === 0) return [];

  // Required lazily: leaveBalance.service → … → this file would loop.
  const { getOrCreateBalance, resolveLeavePolicy } = require('../leave/leaveBalance.service');
  const created = [];
  for (const { date, other } of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const [existing, attendance] = await Promise.all([
      db.LeaveSandwichDay.findOne({ where: { employeeId: employee.id, date }, transaction }),
      db.Attendance.findOne({ where: { employeeId: employee.id, date }, attributes: ['status'], transaction }),
    ]);
    if (existing || (attendance && WORKED.has(attendance.status))) continue;

    const leaveTypeId = chargeableTypeOf(request) || chargeableTypeOf(other);
    let chargedToBalance = false;
    if (leaveTypeId) {
      // eslint-disable-next-line no-await-in-loop
      const policy = await resolveLeavePolicy({
        companyId: employee.companyId,
        leaveTypeId,
        rosterGroupId: employee.rosterGroupId,
        transaction,
      });
      // eslint-disable-next-line no-await-in-loop
      const balance = await getOrCreateBalance({ employeeId: employee.id, leaveTypeId, dateStr: date, transaction });
      if ((policy && policy.isUnlimited) || Number(balance.balance) >= 1) {
        const used = Number(balance.used) + 1;
        // eslint-disable-next-line no-await-in-loop
        await balance.update({ used, balance: Number(balance.allotted) - used }, { transaction });
        chargedToBalance = true;
      }
    }

    const [before, after] = date < request.fromDate ? [other, request] : [request, other];
    // eslint-disable-next-line no-await-in-loop
    await db.LeaveSandwichDay.create(
      {
        companyId: employee.companyId,
        employeeId: employee.id,
        date,
        leaveTypeId: chargedToBalance ? leaveTypeId : null,
        chargedToBalance,
        isLop: !chargedToBalance,
        beforeLeaveRequestId: before.id,
        afterLeaveRequestId: after.id,
      },
      { transaction }
    );
    created.push(date);
  }
  return created;
}

// Undoes every sandwiched day that leaned on this leave — refunds the balance
// day and removes the row. Returns the affected dates.
async function reverseSandwichForLeave({ request, transaction }) {
  const rows = await db.LeaveSandwichDay.findAll({
    where: { [Op.or]: [{ beforeLeaveRequestId: request.id }, { afterLeaveRequestId: request.id }] },
    transaction,
  });
  if (rows.length === 0) return [];
  const { getOrCreateBalance } = require('../leave/leaveBalance.service');
  for (const row of rows) {
    if (row.chargedToBalance && row.leaveTypeId) {
      // eslint-disable-next-line no-await-in-loop
      const balance = await getOrCreateBalance({ employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, dateStr: row.date, transaction });
      const used = Number(balance.used) - 1;
      // eslint-disable-next-line no-await-in-loop
      await balance.update({ used, balance: Number(balance.allotted) - used }, { transaction });
    }
    // eslint-disable-next-line no-await-in-loop
    await row.destroy({ transaction });
  }
  return rows.map((r) => r.date);
}

module.exports = { applySandwichOnApproval, reverseSandwichForLeave };

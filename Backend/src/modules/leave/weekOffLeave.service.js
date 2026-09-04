'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { toBusinessLocal, dateOnly } = require('../../utils/dateRange');
const { computeWeekOffQuota } = require('../../utils/weekOffLeave');

const WEEK_OFF_LEAVE_CODE = 'WEEK_OFF';
const WEEK_OFF_LEAVE_NAME = 'Week Off Leaves';

// Finds (or, the first time a company has an eligible Roster Group, creates)
// that company's single "Week Off Leaves" leave type — shared across every
// eligible Roster Group in the company, same as any other company-wide leave
// type. isWeekOffBucket marks it as system-generated (see leaveType.js) so
// it's excluded from the normal "Add Leave Type" catalog; its actual monthly
// quota is computed dynamically per employee, not stored here — see
// leaveBalance.service.js::computeAllottedForPolicy.
async function ensureWeekOffLeaveType({ companyId }) {
  let leaveType = await db.LeaveType.findOne({ where: { companyId, isWeekOffBucket: true } });
  if (leaveType) return leaveType;

  try {
    leaveType = await db.LeaveType.create({
      companyId,
      code: WEEK_OFF_LEAVE_CODE,
      name: WEEK_OFF_LEAVE_NAME,
      isPaid: true,
      // Use-it-or-lose-it, per month — never carries a remainder forward.
      carryForward: false,
      cycleType: 'calendar',
      defaultAccrual: 'monthly_reset',
      isWeekOffBucket: true,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      // Race: another run (or another eligible Roster Group in the same
      // company processed just before this one) created it first.
      leaveType = await db.LeaveType.findOne({ where: { companyId, isWeekOffBucket: true } });
    } else {
      throw err;
    }
  }
  return leaveType;
}

// Finds (or creates) the RosterGroupLeavePolicy link that makes the Week Off
// Leaves type actually apply to this Roster Group — required both for
// leaveBalance.service.js::resolveLeavePolicy (so a balance can be computed
// at all) and for leaveType.service.js::listLeaveTypes's rosterGroupId-scoped
// path (so it shows up in the employee's own "apply for leave" dropdown).
// annualQuota is a nominal 0 — the real amount is computed fresh every time
// from the Sunday count of whichever month a balance row is being created
// for (see computeAllottedForPolicy's isWeekOffBucket branch), never read
// from this column.
async function ensureWeekOffLeavePolicy({ companyId, leaveTypeId, rosterGroupId }) {
  const existingLink = await db.RosterGroupLeavePolicy.findOne({ where: { rosterGroupId, leaveTypeId } });
  if (existingLink) return existingLink.leavePolicyId;

  let policy = await db.LeavePolicy.findOne({ where: { companyId, leaveTypeId, accrual: 'monthly_reset' } });
  if (!policy) {
    policy = await db.LeavePolicy.create({
      companyId,
      leaveTypeId,
      annualQuota: 0,
      accrual: 'monthly_reset',
      applicableAfterDays: 0,
    });
  }

  try {
    await db.RosterGroupLeavePolicy.create({ rosterGroupId, leavePolicyId: policy.id, leaveTypeId });
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    // Race: link already created by a concurrent run — fine, already linked.
  }
  return policy.id;
}

// Provisions the Week Off Leaves type/policy/link for one Roster Group (if
// its Shift has no weekly-off day at all) and immediately seeds/corrects
// every one of its current employees' balance for whichever month `asOf`
// falls in — a no-op if weeklyOffDays isn't empty, so callers can invoke
// this unconditionally without duplicating the eligibility check.
// Shared by weekOffLeaveAccrual.job.js (the monthly catch-up sweep across
// every Roster Group) and shift.service.js::syncShiftRosterGroups (an eager
// call the moment an admin actually links a no-weekly-off Shift to a Roster
// Group) — the eager call is what closes the gap that would otherwise leave
// an employee seeing nothing until the 1st of next month.
async function syncWeekOffLeaveForRosterGroup({ rosterGroupId, companyId, weeklyOffDays, asOf = toBusinessLocal() }) {
  if (!Array.isArray(weeklyOffDays) || weeklyOffDays.length !== 0) return { processed: 0 };

  // Lazy require — leaveBalance.service.js doesn't import this file, so
  // there's no real cycle, but requiring inline keeps this module's own
  // load order independent of leaveBalance.service.js's.
  const { getOrCreateBalance } = require('./leaveBalance.service');

  const asOfStr = dateOnly(asOf);
  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1;

  const leaveType = await ensureWeekOffLeaveType({ companyId });
  await ensureWeekOffLeavePolicy({ companyId, leaveTypeId: leaveType.id, rosterGroupId });

  const employees = await db.Employee.findAll({
    where: {
      companyId,
      rosterGroupId,
      status: { [Op.in]: ['active', 'onboarding', 'on_notice'] },
    },
    attributes: ['id', 'dateOfJoining'],
  });

  let processed = 0;
  for (const employee of employees) {
    // Computed per employee (not once for the whole Roster Group) — a
    // mid-month joiner's quota is prorated to Sundays from their own
    // joining date onward, so it can legitimately differ from a longer-
    // tenured colleague's full-month count in the same run.
    const target = computeWeekOffQuota({ year, month, dateOfJoining: employee.dateOfJoining });
    const balance = await getOrCreateBalance({ employeeId: employee.id, leaveTypeId: leaveType.id, dateStr: asOfStr });
    if (Number(balance.allotted) !== target) {
      await balance.update({ allotted: target, balance: target - Number(balance.used) });
    }
    processed += 1;
  }
  return { processed };
}

// Re-checks ONE employee's already-existing current-month Week Off Leaves
// balance against their (possibly just-changed) dateOfJoining — called from
// employee.service.js::updateEmployee whenever dateOfJoining is part of the
// update. Correcting a joining date after the fact (e.g. HR mis-typed it, or
// only just heard the real start date) should immediately re-prorate a
// balance row that already exists, not silently sit stale until some other
// trigger happens to touch it. Deliberately narrow: only ever corrects the
// CURRENT month's row (the one actually visible on the employee's own
// balance page) and never CREATES one — an employee who's never had a
// balance row yet will simply get the correct, already-prorated amount the
// first time one IS created (see computeAllottedForPolicy), so there's
// nothing to eagerly fix here for that case.
async function syncWeekOffLeaveForEmployee({ employeeId, asOf = toBusinessLocal() }) {
  const employee = await db.Employee.findOne({
    where: { id: employeeId },
    attributes: ['id', 'companyId', 'rosterGroupId', 'dateOfJoining'],
  });
  if (!employee || !employee.rosterGroupId) return;

  const group = await db.RosterGroup.findOne({
    where: { id: employee.rosterGroupId },
    include: [{ model: db.Shift, as: 'shifts', through: { attributes: [] } }],
  });
  if (!group || group.shifts.length !== 1 || group.shifts[0].weeklyOffDays.length !== 0) return;

  const leaveType = await db.LeaveType.findOne({ where: { companyId: employee.companyId, isWeekOffBucket: true } });
  if (!leaveType) return;

  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1;
  const balance = await db.LeaveBalance.findOne({
    where: { employeeId, leaveTypeId: leaveType.id, year, month },
  });
  if (!balance) return;

  const target = computeWeekOffQuota({ year, month, dateOfJoining: employee.dateOfJoining });
  if (Number(balance.allotted) !== target) {
    await balance.update({ allotted: target, balance: target - Number(balance.used) });
  }
}

module.exports = {
  ensureWeekOffLeaveType,
  ensureWeekOffLeavePolicy,
  syncWeekOffLeaveForRosterGroup,
  syncWeekOffLeaveForEmployee,
  WEEK_OFF_LEAVE_CODE,
  WEEK_OFF_LEAVE_NAME,
};

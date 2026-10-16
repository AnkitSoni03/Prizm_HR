'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { addDays, dateOnly, toBusinessLocal } = require('../../utils/dateRange');
const { PERIOD_EMPLOYMENT_TYPES, computeProbationEndDate, periodLabel, formatDisplayDate } = require('../../utils/probation');
const { hasProbationPeriod } = require('../../utils/leavePeriod');
const { getManagersForEmployee } = require('../../utils/managerScope');
const { notifyUser, notifyApprovers } = require('../../utils/notifications');

// Ends an employee's Probation/Intern period:
//   1. employmentType -> the given type (normally 'full_time'), confirmedOn
//      stamped, the queued Roster cleared, and the still-open probation
//      leave rows closed the day before confirmedOn;
//   2. the queued Roster (if any) is applied through the normal "Change
//      Roster" path with carry-forward — leave types the new Roster doesn't
//      govern move into a capped "Carry Forward" bucket;
//   3. balances for the new period are created right away — every leave type
//      the new Roster governs starts a prorated period (confirmedOn → cycle
//      end) with the probation remainder carried in, capped at the leave
//      type's maxCarryForwardDays (leaveBalance.service.js::getOrCreateBalance).
// Used by the daily job (the day after the period ends, only when a Roster
// is queued) and by an admin changing the Employment Type by hand.
async function confirmEmployee({ employeeId, confirmedOn, employmentType = 'full_time', actorUserId = null, automatic = false }) {
  const employee = await db.Employee.findByPk(employeeId);
  if (!employee || !PERIOD_EMPLOYMENT_TYPES.includes(employee.employmentType)) return null;

  const previousType = employee.employmentType;
  const nextRosterGroupId = employee.nextRosterGroupId;
  // Only a tracked period (DOJ + length) has its own leave period to close.
  const tracked = hasProbationPeriod(employee);

  await db.sequelize.transaction(async (t) => {
    await employee.update(
      { employmentType, confirmedOn: tracked ? confirmedOn : employee.confirmedOn, nextRosterGroupId: null },
      { transaction: t }
    );
    if (tracked) {
      await db.LeaveBalance.update(
        { periodEnd: addDays(confirmedOn, -1) },
        { where: { employeeId: employee.id, month: null, periodEnd: null }, transaction: t }
      );
    }
  });

  let rosterChanged = false;
  let rosterError = null;
  if (nextRosterGroupId && String(nextRosterGroupId) !== String(employee.rosterGroupId ?? '')) {
    try {
      const { changeEmployeeRoster } = require('./rosterTransfer.service');
      await changeEmployeeRoster({
        companyId: employee.companyId,
        id: employee.id,
        newRosterGroupId: nextRosterGroupId,
        carryForward: true,
        actorUserId,
      });
      rosterChanged = true;
    } catch (err) {
      rosterError = err.message;
      console.error(`Queued roster switch failed for employee ${employee.id}:`, err);
    }
  }

  try {
    const { ensureBalancesForEmployee } = require('../leave/leaveBalance.service');
    await ensureBalancesForEmployee({ employeeId: employee.id });
  } catch (err) {
    console.error(`Seeding post-probation leave balances failed for employee ${employee.id}:`, err);
  }

  await employee.reload();
  if (automatic) await notifyConfirmation({ employee, previousType, rosterChanged, rosterError });
  return { employee, rosterChanged, rosterError };
}

async function notifyConfirmation({ employee, previousType, rosterChanged, rosterError }) {
  try {
    const roster = rosterChanged && employee.rosterGroupId
      ? await db.RosterGroup.findOne({ where: { id: employee.rosterGroupId }, attributes: ['id', 'name'] })
      : null;
    const period = periodLabel(previousType);
    const since = formatDisplayDate(employee.confirmedOn);
    const rosterText = roster ? ` and moved to the "${roster.name}" roster` : '';
    const name = employee.name || employee.employeeCode || 'An employee';

    await notifyUser({
      companyId: employee.companyId,
      userId: employee.userId,
      type: 'probation_confirmed',
      title: 'You are now a Full-time employee',
      body: `Your ${period} has ended. From ${since} you are Full-time${rosterText}. Your leave balance has been updated.`,
    });

    const adminTitle = `${name} is now Full-time`;
    const adminBody = rosterError
      ? `${name}'s ${period} ended — Employment Type changed to Full-time from ${since}, but the queued roster could not be applied (${rosterError}). Assign it from the employee's details.`
      : `${name}'s ${period} ended — Employment Type changed to Full-time from ${since}${rosterText}, with leaves carried forward.`;

    const managers = await getManagersForEmployee({ companyId: employee.companyId, employeeId: employee.id });
    const notified = new Set([String(employee.userId)]);
    for (const manager of managers) {
      if (!manager.userId || notified.has(String(manager.userId))) continue;
      notified.add(String(manager.userId));
      await notifyUser({ companyId: manager.companyId, userId: manager.userId, type: 'probation_confirmed', title: adminTitle, body: adminBody });
    }
    await notifyApprovers({
      companyId: employee.companyId,
      brandId: employee.brandId,
      code: 'employee:update',
      excludeUserIds: [...notified],
      type: 'probation_confirmed',
      title: adminTitle,
      body: adminBody,
    });
  } catch (err) {
    console.error(`Probation confirmation notification failed for employee ${employee.id}:`, err);
  }
}

// Probation/Intern employees whose period has ended (as of `asOf`) and who
// have a Roster queued. Nothing queued = they stay as they are (same Roster,
// same type, same leave period) — the daily reminder keeps nudging admins.
async function findDueConversions({ asOf = toBusinessLocal(), employeeId } = {}) {
  const today = dateOnly(asOf);
  const employees = await db.Employee.findAll({
    where: {
      ...(employeeId ? { id: employeeId } : {}),
      isActive: true,
      employmentType: { [Op.in]: PERIOD_EMPLOYMENT_TYPES },
      probationPeriodDays: { [Op.not]: null },
      dateOfJoining: { [Op.not]: null },
      nextRosterGroupId: { [Op.not]: null },
    },
  });
  return employees
    .map((employee) => ({ employee, endDate: computeProbationEndDate(employee) }))
    .filter(({ endDate }) => endDate && endDate < today);
}

async function runProbationConversions({ asOf = toBusinessLocal(), employeeId } = {}) {
  const due = await findDueConversions({ asOf, employeeId });
  let converted = 0;
  for (const { employee, endDate } of due) {
    try {
      const result = await confirmEmployee({
        employeeId: employee.id,
        confirmedOn: addDays(endDate, 1),
        employmentType: 'full_time',
        automatic: true,
      });
      if (result) converted += 1;
    } catch (err) {
      console.error(`Probation conversion failed for employee ${employee.id}:`, err);
    }
  }
  return { converted };
}

// Best-effort, for right after an admin saves an employee (a back-dated DOJ
// or a shortened period may already be past its end).
async function convertIfDue(employeeId) {
  try {
    await runProbationConversions({ employeeId });
  } catch (err) {
    console.error(`Probation conversion check failed for employee ${employeeId}:`, err);
  }
}

module.exports = { confirmEmployee, runProbationConversions, convertIfDue };

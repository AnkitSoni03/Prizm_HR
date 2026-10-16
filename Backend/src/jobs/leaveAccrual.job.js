'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { getOrCreateBalance, refreshMonthlyAccrual } = require('../modules/leave/leaveBalance.service');
const { toBusinessLocal, dateOnly } = require('../utils/dateRange');

// Repeatable job, scheduled '0 0 1 * *' (midnight on the 1st of each month)
// from src/server.js. Touches every active employee's balance for every
// Roster-linked policy:
//   - creates the row for the period that's current today if it doesn't
//     exist yet — this is what makes the yearly renewal (with capped
//     carry-forward) show up on the 1st of each company's/employee's own
//     "Yearly Roster Update" month without anyone opening the page; a
//     Probation/Intern employee's single probation row is simply found again
//     (no renewal while the period runs — utils/leavePeriod.js);
//   - for 'monthly' accrual, recomputes what has accrued so far in the row's
//     period (plus its carried-in amount). Idempotent.
async function runLeaveAccrual({ asOf = toBusinessLocal() } = {}) {
  const asOfStr = dateOnly(asOf);

  const policies = await db.LeavePolicy.findAll();

  let processed = 0;
  for (const policy of policies) {
    // Unlimited quota: nothing to accrue (no insufficient-balance check ever
    // runs against it). Linked types (e.g. Half Day) have no balance of
    // their own — checked below once the leave type is loaded.
    if (policy.isUnlimited) continue;

    // A policy's Roster scoping is a many-to-many join, not a column — it
    // can be linked to zero, one, or several Rosters. Roster is now the sole
    // determinant of who a policy applies to (see
    // leaveBalance.service.js::resolveLeavePolicy) — a policy with zero
    // Roster links is dormant (never accrues for anyone) rather than a
    // "company-wide default", so it's skipped outright here.
    const links = await db.RosterGroupLeavePolicy.findAll({
      where: { leavePolicyId: policy.id },
      attributes: ['rosterGroupId'],
    });
    const linkedRosterGroupIds = links.map((l) => l.rosterGroupId);
    if (linkedRosterGroupIds.length === 0) continue;

    const leaveType = await db.LeaveType.findOne({
      where: { id: policy.leaveTypeId },
      attributes: ['id', 'applicableGender', 'deductFromLeaveTypeId'],
    });
    if (leaveType && leaveType.deductFromLeaveTypeId) continue;

    const employees = await db.Employee.findAll({
      where: {
        companyId: policy.companyId,
        status: { [Op.in]: ['active', 'onboarding', 'on_notice'] },
        rosterGroupId: { [Op.in]: linkedRosterGroupIds },
        // Gender-restricted type (e.g. Maternity Leave) only accrues for
        // employees whose gender matches — same rule as the apply-leave
        // check in leaveRequest.service.js.
        ...(leaveType && leaveType.applicableGender && leaveType.applicableGender !== 'all'
          ? { gender: leaveType.applicableGender }
          : {}),
      },
    });

    for (const employee of employees) {
      const balance = await getOrCreateBalance({ employeeId: employee.id, leaveTypeId: policy.leaveTypeId, dateStr: asOfStr });

      if (policy.accrual === 'monthly' && balance && balance.month === null) {
        await refreshMonthlyAccrual({ balance, policy, employee, asOfStr });
      }
      // 'monthly_reset' needs nothing further here — each calendar month
      // now gets its OWN balance row (see leaveBalance.service.js::
      // getOrCreateBalance's month-grain handling), created fresh with the
      // flat quota the moment anything first touches it (this cron run, or
      // an eligibility check/approval that beat the cron to it). Blindly
      // resetting an EXISTING row in place — the old behavior — would wipe
      // out real `used` days already recorded against this month.
      processed += 1;
    }
  }

  return { processed };
}

module.exports = { runLeaveAccrual };

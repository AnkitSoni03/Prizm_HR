'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { getOrCreateBalance, monthsAccruedInCycle } = require('../modules/leave/leaveBalance.service');
const { toBusinessLocal, dateOnly } = require('../utils/dateRange');
const { resolveLeaveCycle } = require('../utils/leaveCycle');

// Repeatable job, scheduled '0 0 1 * *' (midnight on the 1st of each month)
// from src/server.js. PHASE4_MODELS.md: "monthly: annual_quota / 12 credited
// each month, pro-rated for employees joining mid-year". Recomputes
// `allotted` from scratch each run rather than incrementing it — since
// monthsAccruedInCycle only grows as real time moves forward, recomputation
// is idempotent even if this runs more than once for the same month.
//
// Running every month (not just January) for monthly/monthly_reset policies
// is also what makes 'anniversary' cycle types (see utils/leaveCycle.js)
// work with zero extra scheduling logic here: each employee's own cycle
// naturally rolls over — and getOrCreateBalance's carry-forward kicks in —
// whichever month that employee's own join-anniversary happens to fall in,
// since this job touches every employee's balance every month regardless.
async function runLeaveAccrual({ asOf = toBusinessLocal() } = {}) {
  const asOfStr = dateOnly(asOf);
  const isJanuary = asOf.getMonth() === 0;

  // Outside January there's nothing to do for yearly-accrual policies —
  // those are seeded in full the moment a balance row is first created
  // (see leaveBalance.service.js::getOrCreateBalance), lazily, whenever an
  // employee's cycle next needs one — true for both cycle types, so no
  // active cron work is needed for 'yearly' policies at all. monthly_reset
  // must run every month (including January), same as monthly.
  const policies = await db.LeavePolicy.findAll({
    where: isJanuary ? {} : { accrual: { [Op.in]: ['monthly', 'monthly_reset'] } },
  });

  let processed = 0;
  for (const policy of policies) {
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

    const leaveType = await db.LeaveType.findOne({ where: { id: policy.leaveTypeId }, attributes: ['id', 'cycleType'] });
    const cycleType = leaveType ? leaveType.cycleType : 'calendar';

    const employees = await db.Employee.findAll({
      where: {
        companyId: policy.companyId,
        status: { [Op.in]: ['active', 'onboarding', 'on_notice'] },
        rosterGroupId: { [Op.in]: linkedRosterGroupIds },
      },
      attributes: ['id', 'dateOfJoining'],
    });

    for (const employee of employees) {
      const balance = await getOrCreateBalance({ employeeId: employee.id, leaveTypeId: policy.leaveTypeId, dateStr: asOfStr });

      if (policy.accrual === 'monthly') {
        const { cycleStart, cycleEnd } = resolveLeaveCycle({
          cycleType,
          dateOfJoining: employee.dateOfJoining,
          dateStr: asOfStr,
        });
        const monthlyAmount = Number(policy.annualQuota) / 12;
        const months = monthsAccruedInCycle({ cycleStart, cycleEnd, dateOfJoining: employee.dateOfJoining, asOf });
        const allotted = Math.round(monthlyAmount * months * 100) / 100;
        if (Number(balance.allotted) !== allotted) {
          await balance.update({ allotted, balance: allotted - Number(balance.used) });
        }
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

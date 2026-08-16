'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { getOrCreateBalance, monthsAccruedForYear } = require('../modules/leave/leaveBalance.service');
const { toBusinessLocal } = require('../utils/dateRange');

// Repeatable job, scheduled '0 0 1 * *' (midnight on the 1st of each month)
// from src/server.js. PHASE4_MODELS.md: "monthly: annual_quota / 12 credited
// each month, pro-rated for employees joining mid-year". Recomputes
// `allotted` from scratch each run rather than incrementing it — since
// monthsAccruedForYear only grows as real time moves forward, recomputation
// is idempotent even if this runs more than once for the same month.
async function runLeaveAccrual({ asOf = toBusinessLocal() } = {}) {
  const year = asOf.getFullYear();
  const isJanuary = asOf.getMonth() === 0;

  // Outside January there's nothing to do for yearly-accrual policies —
  // those are seeded in full the moment a balance row is first created
  // (see leaveBalance.service.js::getOrCreateBalance). monthly_reset must
  // run every month (including January), same as monthly.
  const policies = await db.LeavePolicy.findAll({
    where: isJanuary ? {} : { accrual: { [Op.in]: ['monthly', 'monthly_reset'] } },
  });

  let processed = 0;
  for (const policy of policies) {
    const employees = await db.Employee.findAll({
      where: { companyId: policy.companyId, status: { [Op.in]: ['active', 'onboarding', 'on_notice'] } },
      attributes: ['id', 'dateOfJoining'],
    });

    for (const employee of employees) {
      const balance = await getOrCreateBalance({ employeeId: employee.id, leaveTypeId: policy.leaveTypeId, year });

      if (policy.accrual === 'monthly') {
        const monthlyAmount = Number(policy.annualQuota) / 12;
        const months = monthsAccruedForYear({ year, dateOfJoining: employee.dateOfJoining, asOf });
        const allotted = Math.round(monthlyAmount * months * 100) / 100;
        if (Number(balance.allotted) !== allotted) {
          await balance.update({ allotted, balance: allotted - Number(balance.used) });
        }
      } else if (policy.accrual === 'monthly_reset') {
        // Use-it-or-lose-it: reset to the flat quota every month, unlike
        // 'monthly' above which only tops up `allotted` and keeps `used`
        // running for the whole year. `used` is explicitly zeroed here too
        // — this run is expected to fire once, on the 1st of the month.
        const allotted = Number(policy.annualQuota);
        if (Number(balance.allotted) !== allotted || Number(balance.used) !== 0) {
          await balance.update({ allotted, used: 0, balance: allotted });
        }
      }
      processed += 1;
    }
  }

  return { processed };
}

module.exports = { runLeaveAccrual };

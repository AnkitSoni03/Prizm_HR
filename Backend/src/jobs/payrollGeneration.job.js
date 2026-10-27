'use strict';

const { generateMonthForAll, generateFinalSettlements, processPendingRecalcs, refreshUnlockedMonths, previousMonth } = require('../modules/payroll/payrollEngine');

// Scheduled daily from src/server.js. Generates last month's payroll for
// every employee with a salary — a no-op once it exists, so running daily
// (not only on the 1st) just means a server that was down on the 1st still
// catches up. Then refreshes any month flagged for recalculation that the
// immediate after-change recalculation didn't get to, and works every month
// not locked yet (a draft) out again, so roster / shift changes — which
// don't trigger a recalculation themselves — are in before HR locks it.
async function runPayrollGeneration() {
  const { year, month } = previousMonth();
  const { created } = await generateMonthForAll({ year, month });
  // Salaries ended in the running month are settled without waiting for it to end.
  const finals = await generateFinalSettlements();
  const recalculated = await processPendingRecalcs();
  const refreshed = await refreshUnlockedMonths();
  return { year, month, created, finals, recalculated, refreshed };
}

module.exports = { runPayrollGeneration, processPendingRecalcs };

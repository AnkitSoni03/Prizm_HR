'use strict';

const { generateMonthForAll, processPendingRecalcs, previousMonth } = require('../modules/payroll/payrollEngine');

// Scheduled daily from src/server.js. Generates last month's payroll for
// every employee with a salary — a no-op once it exists, so running daily
// (not only on the 1st) just means a server that was down on the 1st still
// catches up. Then refreshes any month flagged for recalculation that the
// immediate after-change recalculation didn't get to.
async function runPayrollGeneration() {
  const { year, month } = previousMonth();
  const { created } = await generateMonthForAll({ year, month });
  const recalculated = await processPendingRecalcs();
  return { year, month, created, recalculated };
}

module.exports = { runPayrollGeneration, processPendingRecalcs };

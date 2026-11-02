'use strict';

// leave_policies.quota_history: for 'monthly' accrual, a change to the yearly
// quota applies from the NEXT month only — months already credited keep the
// rate they were credited at. Entries are [{ from: 'YYYY-MM', annualQuota }],
// sorted; the rate for a month is the latest entry with from <= that month.
// NULL = never changed (every month uses annual_quota, unchanged behavior).
// Additive only: no existing row or balance is touched.
// See utils/leaveQuotaHistory.js.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('leave_policies');
    if (!table.quota_history) {
      await queryInterface.addColumn('leave_policies', 'quota_history', {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_policies', 'quota_history');
  },
};

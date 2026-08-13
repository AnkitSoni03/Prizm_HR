'use strict';

// leave_policies.accrual gains 'monthly_reset': unlike the existing 'monthly'
// value (annual_quota / 12, cumulative across the year — unused leave stays
// available in later months), 'monthly_reset' grants a flat annual_quota
// amount each month and does NOT carry forward — the balance is reset to
// annual_quota on the 1st of every month regardless of usage. Built for
// Short Leave (2/month, use-it-or-lose-it) but usable by any leave type.
// Same standalone ALTER TYPE pattern as 20260803100100-add-face-to-attendance-source.js.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_leave_policies_accrual" ADD VALUE IF NOT EXISTS 'monthly_reset';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. No-op.
  },
};

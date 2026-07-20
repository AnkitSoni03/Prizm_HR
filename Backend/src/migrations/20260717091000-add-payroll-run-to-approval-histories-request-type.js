'use strict';

// Reuses approval_histories as the audit trail for payroll run lifecycle
// transitions (process/pay) instead of a new table — see
// utils/approvalHistory.js. Standalone, single-statement migration: safe
// because this repo's migrations aren't transaction-wrapped, and the new
// enum value is only ever used from later application code in a separate
// DB session, never in the same transaction that adds it.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_approval_histories_request_type" ADD VALUE IF NOT EXISTS 'payroll_run';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE — removing an enum value
    // requires rebuilding the type, which isn't safe to do generically here.
    // No-op; rolling back this migration leaves the added value in place.
  },
};

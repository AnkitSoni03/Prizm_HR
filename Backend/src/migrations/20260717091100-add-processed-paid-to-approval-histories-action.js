'use strict';

// ApprovalHistory.action semantically stretches here from "approve/reject a
// request" to "record a state transition" — a payroll run's process/pay
// steps genuinely fit the same actor/reason/decided_at shape as an
// approve/reject decision.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_approval_histories_action" ADD VALUE IF NOT EXISTS 'processed';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_approval_histories_action" ADD VALUE IF NOT EXISTS 'paid';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. No-op.
  },
};

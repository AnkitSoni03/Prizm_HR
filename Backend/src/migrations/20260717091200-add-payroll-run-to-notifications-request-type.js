'use strict';

// notifications.request_type is a separate, independently named Postgres
// enum type from approval_histories.request_type despite sharing identical
// values today — confirmed by reading both CREATE TABLE migrations — so it
// needs its own ALTER TYPE, distinct from
// 20260717091000-add-payroll-run-to-approval-histories-request-type.js.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_notifications_request_type" ADD VALUE IF NOT EXISTS 'payroll_run';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. No-op.
  },
};

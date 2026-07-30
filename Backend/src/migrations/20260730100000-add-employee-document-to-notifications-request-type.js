'use strict';

// New value for the self-upload/verify document notification flow —
// same standalone ALTER TYPE pattern as
// 20260717091200-add-payroll-run-to-notifications-request-type.js.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_notifications_request_type" ADD VALUE IF NOT EXISTS 'employee_document';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. No-op.
  },
};

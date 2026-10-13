'use strict';

// Same standalone ALTER TYPE pattern as 20261012090200.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_notifications_request_type" ADD VALUE IF NOT EXISTS 'payslip_request';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_notifications_request_type" ADD VALUE IF NOT EXISTS 'payroll';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_approval_histories_request_type" ADD VALUE IF NOT EXISTS 'payslip_request';`
    );
  },

  async down() {
    // Enum values can't be dropped in Postgres.
  },
};

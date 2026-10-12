'use strict';

// Same standalone ALTER TYPE pattern as 20260717091200 — this repo's
// migrations aren't transaction-wrapped, so ADD VALUE is safe here.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_notifications_request_type" ADD VALUE IF NOT EXISTS 'resignation';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_approval_histories_request_type" ADD VALUE IF NOT EXISTS 'resignation';`
    );
  },

  async down() {
    // Enum values can't be dropped in Postgres — same as 20260805090100.
  },
};

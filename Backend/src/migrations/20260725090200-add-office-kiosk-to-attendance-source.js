'use strict';

// attendance.source gains 'office_kiosk' for the new kiosk+video flow,
// alongside the existing 'qr' (old terminal flow, left dormant) and 'od'.
// Same standalone ALTER TYPE pattern as
// 20260717091100-add-processed-paid-to-approval-histories-action.js.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_attendance_source" ADD VALUE IF NOT EXISTS 'office_kiosk';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. No-op.
  },
};

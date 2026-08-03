'use strict';

// attendance.source gains 'face' for the new face-recognition kiosk flow,
// alongside the now-write-dead 'qr'/'office_kiosk' (historical rows only)
// and 'od'. Same standalone ALTER TYPE pattern as
// 20260725090200-add-office-kiosk-to-attendance-source.js.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_attendance_source" ADD VALUE IF NOT EXISTS 'face';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. No-op.
  },
};

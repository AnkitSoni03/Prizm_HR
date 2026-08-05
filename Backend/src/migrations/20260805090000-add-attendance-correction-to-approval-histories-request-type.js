'use strict';

// Reuses approval_histories as the audit trail for an admin directly
// setting/correcting an employee's attendance status (attendance.service.js
// ::bulkSetAttendanceStatus) — same "add a new enum value instead of a new
// table" precedent as the payroll_run request_type addition. Standalone,
// single-statement migration: safe because this repo's migrations aren't
// transaction-wrapped, and the new value is only ever used from later
// application code in a separate DB session.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_approval_histories_request_type" ADD VALUE IF NOT EXISTS 'attendance_correction';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE — removing an enum value
    // requires rebuilding the type, which isn't safe to do generically here.
    // No-op; rolling back this migration leaves the added value in place.
  },
};

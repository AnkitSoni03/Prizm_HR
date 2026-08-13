'use strict';

// employees.employment_type gains 'probation' — probationary employees were
// previously forced into 'full_time'/'part_time'/'contract' with no way to
// flag probation status separately. Same standalone ALTER TYPE pattern as
// 20260803100100-add-face-to-attendance-source.js.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_employees_employment_type" ADD VALUE IF NOT EXISTS 'probation';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. No-op.
  },
};

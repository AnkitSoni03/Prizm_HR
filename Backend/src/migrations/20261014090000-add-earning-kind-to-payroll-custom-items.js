'use strict';

// Group-wide extra items can now also be recurring allowances ('earning'),
// carved out of CTC like Basic/HRA (the Special allowance shrinks to make
// room). Same standalone ALTER TYPE pattern as 20261013090800.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_payroll_custom_items_kind" ADD VALUE IF NOT EXISTS 'earning';`
    );
  },

  async down() {
    // Enum values can't be dropped in Postgres.
  },
};

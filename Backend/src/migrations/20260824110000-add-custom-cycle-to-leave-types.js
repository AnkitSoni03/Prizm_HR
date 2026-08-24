'use strict';

// Third Leave Cycle option alongside 'calendar'/'anniversary': an
// admin-defined recurring annual start date (e.g. "April 1" for an Indian
// fiscal year) instead of Jan 1 or the employee's own joining date. Standalone
// ALTER TYPE, same pattern as 20260805090100/20260822100100 — this repo's
// migrations aren't transaction-wrapped, so the new enum value is safely
// visible to later application code in a separate DB session.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_leave_types_cycle_type" ADD VALUE IF NOT EXISTS 'custom';`
    );
    await queryInterface.addColumn('leave_types', 'custom_cycle_start_month', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('leave_types', 'custom_cycle_start_day', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_types', 'custom_cycle_start_day');
    await queryInterface.removeColumn('leave_types', 'custom_cycle_start_month');
    // No down for the enum value itself — Postgres can't drop a single enum
    // value (same accepted limitation as the migrations this one mirrors).
  },
};

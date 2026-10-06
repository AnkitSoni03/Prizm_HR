'use strict';

// Probation / Intern period tracking (utils/probation.js,
// jobs/probationReminder.job.js). Additive only — no existing row changes:
//   - employment_type gains 'intern' (same ALTER TYPE pattern as
//     20260813090000's 'probation').
//   - probation_period_days: optional, admin-chosen length of the period,
//     counted from date_of_joining (DOJ = day 1).
//   - probation_last_notified_on: the business date the daily reminder last
//     went out, so a server restart / second run the same day never sends a
//     duplicate.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_employees_employment_type" ADD VALUE IF NOT EXISTS 'intern';`
    );
    await queryInterface.addColumn('employees', 'probation_period_days', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('employees', 'probation_last_notified_on', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'probation_last_notified_on');
    await queryInterface.removeColumn('employees', 'probation_period_days');
    // Enum values can't be dropped in Postgres — same as 20260805090100.
  },
};

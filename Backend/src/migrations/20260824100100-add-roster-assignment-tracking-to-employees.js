'use strict';

// roster_assigned_at: when the employee's CURRENT roster_group_id was set
// (by rosterTransfer.service.js::changeEmployeeRoster/renewEmployeeRoster,
// or rosterGroup.service.js::bulkAssignRosterGroup) — the anchor date the
// Roster's own validity_value/validity_unit (previous migration) counts
// from. Null whenever roster_group_id is null.
//
// roster_expiry_notified_threshold_days: the smallest reminder threshold
// (see jobs/rosterExpiryReminder.job.js's REMINDER_THRESHOLDS_DAYS) already
// notified for the CURRENT assignment cycle — reset to null on every
// (re)assignment/renewal so reminders fire again for the new cycle, and
// stops the daily job from re-notifying at the same threshold every day.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'roster_assigned_at', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn('employees', 'roster_expiry_notified_threshold_days', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'roster_expiry_notified_threshold_days');
    await queryInterface.removeColumn('employees', 'roster_assigned_at');
  },
};

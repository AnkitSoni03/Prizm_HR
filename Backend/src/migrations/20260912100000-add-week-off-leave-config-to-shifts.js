'use strict';

const { DataTypes } = require('sequelize');

// A 0-weekly-off Shift used to unconditionally get Sunday-basis Week Off
// Leaves (weekOffLeave.service.js hardcoded getDay() === 0). This makes it
// admin-configurable per Shift instead: weekOffLeaveEnabled (null for a
// normal Shift with real weekly-off days — the choice never applies to it)
// and weekOffLeaveBasisDays (which day(s)-of-week count toward the monthly
// quota when enabled, generalizing the old Sunday-only assumption).
//
// Backfill preserves current behavior for every EXISTING 0-weekly-off Shift
// (enabled=true, basis=[Sunday]) — real employees already have running
// balances off this assumption; only NEW shifts (or ones later edited) go
// through the new explicit Yes/No + day-picker flow.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('shifts', 'week_off_leave_enabled', {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('shifts', 'week_off_leave_basis_days', {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: false,
      defaultValue: [],
    });

    await queryInterface.sequelize.query(`
      UPDATE shifts
      SET week_off_leave_enabled = true, week_off_leave_basis_days = '{0}'
      WHERE weekly_off_days = '{}';
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('shifts', 'week_off_leave_basis_days');
    await queryInterface.removeColumn('shifts', 'week_off_leave_enabled');
  },
};

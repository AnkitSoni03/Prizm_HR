'use strict';

const { DataTypes } = require('sequelize');

// Admin-only, optional per-employee restriction: day(s)-of-week this
// employee may NOT apply Week Off Leave against, even though their Shift's
// weekOffLeaveBasisDays makes that day eligible in general (e.g. a
// rotational shift where this one employee must always be reachable on
// Mondays). Only ever set by an admin (rides the existing employee:update
// gate, no separate permission) and only meaningful for an employee on a
// 0-weekly-off + Week-Off-Leave-enabled roster/shift — a no-op otherwise
// since that employee has no Week Off Leave type to apply against at all.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('employees', 'week_off_leave_blocked_days', {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: false,
      defaultValue: [],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'week_off_leave_blocked_days');
  },
};

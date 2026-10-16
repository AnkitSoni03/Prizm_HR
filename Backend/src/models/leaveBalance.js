'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeaveBalance extends Model {
    static associate(models) {
      LeaveBalance.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      LeaveBalance.belongsTo(models.LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });
    }
  }

  LeaveBalance.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      leaveTypeId: { type: DataTypes.BIGINT, allowNull: false },
      year: { type: DataTypes.INTEGER, allowNull: false },
      // NULL for 'yearly'/'monthly' accrual (one row per year, as always).
      // Set to the calendar month (1-12) for 'monthly_reset' accrual — each
      // month gets its own row so a delayed approval crossing a reset
      // boundary can never land on the wrong month's balance. See
      // leaveBalance.service.js::getOrCreateBalance.
      month: { type: DataTypes.INTEGER, allowNull: true },
      // The period this row covers (see utils/leavePeriod.js): a calendar
      // month for month-grain rows; otherwise a yearly cycle, or a
      // Probation/Intern period. period_end is NULL while a probation period
      // is still running. `year` = the calendar year periodStart falls in.
      periodStart: { type: DataTypes.DATEONLY, allowNull: false },
      periodEnd: { type: DataTypes.DATEONLY, allowNull: true },
      // Part of `allotted` carried in from the previous period (capped by the
      // leave type's maxCarryForwardDays). Monthly accrual recomputes
      // allotted as accrued + carriedForward.
      carriedForward: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      allotted: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      used: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      balance: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      modelName: 'LeaveBalance',
      tableName: 'leave_balances',
      underscored: true,
      paranoid: true,
    }
  );

  return LeaveBalance;
};

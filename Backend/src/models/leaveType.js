'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class LeaveType extends Model {
    static associate(models) {
      LeaveType.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      LeaveType.hasMany(models.LeavePolicy, { foreignKey: 'leaveTypeId', as: 'policies' });
      LeaveType.hasMany(models.LeaveBalance, { foreignKey: 'leaveTypeId', as: 'balances' });
      LeaveType.hasMany(models.LeaveRequest, { foreignKey: 'leaveTypeId', as: 'requests' });
      // Self-reference: a system-generated "CF - <name>" bucket type (see
      // isCarryForwardBucket below) points back at the original type it was
      // split off from — rosterTransfer.service.js uses this to find-and-
      // reuse the same bucket across repeated roster changes instead of
      // creating a new one every time.
      LeaveType.belongsTo(models.LeaveType, { foreignKey: 'sourceLeaveTypeId', as: 'sourceLeaveType' });
    }
  }

  LeaveType.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      isPaid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // Whether an unused balance rolls into the next cycle at all — see
      // maxCarryForwardDays/cycleType below for how much and when.
      carryForward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Cap on days carried forward when carryForward is true. NULL =
      // unlimited (carryForward: false is what means "zero", not this).
      maxCarryForwardDays: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      // 'calendar' (Jan 1 – Dec 31, the only behavior before this column
      // existed), 'anniversary' (resets on the employee's own joining-date
      // anniversary), or 'custom' (an admin-defined recurring start date —
      // see customCycleStartMonth/Day below) — see utils/leaveCycle.js.
      cycleType: { type: DataTypes.ENUM('calendar', 'anniversary', 'custom'), allowNull: false, defaultValue: 'calendar' },
      // Only meaningful when cycleType is 'custom' — the recurring
      // month/day (e.g. 4/1 for an Indian fiscal year) the cycle resets on
      // every year, regardless of any employee's own joining date.
      customCycleStartMonth: { type: DataTypes.INTEGER, allowNull: true },
      customCycleStartDay: { type: DataTypes.INTEGER, allowNull: true },
      // Pure UX default for the Add Leave Policy form's Accrual field —
      // never enforced; a Roster-specific policy can still pick a different
      // accrual for the same leave type.
      defaultAccrual: { type: DataTypes.ENUM('yearly', 'monthly', 'monthly_reset'), allowNull: true },
      // True for a system-generated "CF - <name>" bucket created by
      // rosterTransfer.service.js — excluded from normal "Add Leave Type"
      // catalog pickers on the frontend.
      isCarryForwardBucket: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sourceLeaveTypeId: { type: DataTypes.BIGINT, allowNull: true },
      // True for the system-generated "Week Off Leaves" type created by
      // weekOffLeave.service.js for a Roster Group whose Shift has no
      // weekly-off day — excluded from the normal "Add Leave Type" catalog
      // pickers, same as isCarryForwardBucket above.
      isWeekOffBucket: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      modelName: 'LeaveType',
      tableName: 'leave_types',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(LeaveType);

  return LeaveType;
};

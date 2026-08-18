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
      // existed) or 'anniversary' (resets on the employee's own joining-date
      // anniversary) — see utils/leaveCycle.js.
      cycleType: { type: DataTypes.ENUM('calendar', 'anniversary'), allowNull: false, defaultValue: 'calendar' },
      // Pure UX default for the Add Leave Policy form's Accrual field —
      // never enforced; a Roster-specific policy can still pick a different
      // accrual for the same leave type.
      defaultAccrual: { type: DataTypes.ENUM('yearly', 'monthly', 'monthly_reset'), allowNull: true },
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

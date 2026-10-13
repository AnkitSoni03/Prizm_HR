'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

// See migration 20261013090700 and modules/payroll/sandwichRule.js.
module.exports = (sequelize, DataTypes) => {
  class LeaveSandwichDay extends Model {
    static associate(models) {
      LeaveSandwichDay.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      LeaveSandwichDay.belongsTo(models.LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });
    }
  }

  LeaveSandwichDay.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      leaveTypeId: { type: DataTypes.BIGINT, allowNull: true },
      chargedToBalance: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isLop: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      beforeLeaveRequestId: { type: DataTypes.BIGINT, allowNull: false },
      afterLeaveRequestId: { type: DataTypes.BIGINT, allowNull: false },
    },
    {
      sequelize,
      modelName: 'LeaveSandwichDay',
      tableName: 'leave_sandwich_days',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(LeaveSandwichDay);

  return LeaveSandwichDay;
};

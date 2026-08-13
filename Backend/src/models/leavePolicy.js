'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class LeavePolicy extends Model {
    static associate(models) {
      LeavePolicy.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      LeavePolicy.belongsTo(models.LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });
    }
  }

  LeavePolicy.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      leaveTypeId: { type: DataTypes.BIGINT, allowNull: false },
      annualQuota: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      // 'monthly_reset': flat annualQuota amount granted every month, reset
      // (not cumulative) — no carry-forward. See migration
      // 20260813090100 and leaveBalance.service.js/leaveAccrual.job.js.
      accrual: {
        type: DataTypes.ENUM('yearly', 'monthly', 'monthly_reset'),
        allowNull: false,
        defaultValue: 'yearly',
      },
      applicableAfterDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      modelName: 'LeavePolicy',
      tableName: 'leave_policies',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(LeavePolicy);

  return LeavePolicy;
};

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
      carryForward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
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

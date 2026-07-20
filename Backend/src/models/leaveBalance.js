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

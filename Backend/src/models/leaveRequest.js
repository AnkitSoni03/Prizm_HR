'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeaveRequest extends Model {
    static associate(models) {
      LeaveRequest.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      LeaveRequest.belongsTo(models.Employee, { foreignKey: 'approverId', as: 'approver' });
      LeaveRequest.belongsTo(models.User, { foreignKey: 'approverUserId', as: 'approverUser' });
      LeaveRequest.belongsTo(models.LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });
      LeaveRequest.belongsTo(models.CompOffCredit, { foreignKey: 'compOffCreditId', as: 'compOffCredit' });
    }
  }

  LeaveRequest.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      leaveTypeId: { type: DataTypes.BIGINT, allowNull: false },
      fromDate: { type: DataTypes.DATEONLY, allowNull: false },
      toDate: { type: DataTypes.DATEONLY, allowNull: false },
      days: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      reason: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      approverId: { type: DataTypes.BIGINT, allowNull: true },
      approverUserId: { type: DataTypes.BIGINT, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
      compOffCreditId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'LeaveRequest',
      tableName: 'leave_requests',
      underscored: true,
      paranoid: true,
    }
  );

  return LeaveRequest;
};

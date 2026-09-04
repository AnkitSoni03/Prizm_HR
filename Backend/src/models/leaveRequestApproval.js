'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeaveRequestApproval extends Model {
    static associate(models) {
      LeaveRequestApproval.belongsTo(models.LeaveRequest, { foreignKey: 'leaveRequestId', as: 'leaveRequest' });
      LeaveRequestApproval.belongsTo(models.Employee, { foreignKey: 'managerEmployeeId', as: 'manager' });
    }
  }

  LeaveRequestApproval.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      leaveRequestId: { type: DataTypes.BIGINT, allowNull: false },
      managerEmployeeId: { type: DataTypes.BIGINT, allowNull: false },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'bypassed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reason: { type: DataTypes.TEXT, allowNull: true },
      decidedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'LeaveRequestApproval',
      tableName: 'leave_request_approvals',
      underscored: true,
      paranoid: true,
    }
  );

  return LeaveRequestApproval;
};

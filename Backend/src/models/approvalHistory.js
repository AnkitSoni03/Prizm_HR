'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class ApprovalHistory extends Model {
    static associate(models) {
      ApprovalHistory.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      ApprovalHistory.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'actorUser' });
      ApprovalHistory.belongsTo(models.Employee, { foreignKey: 'actorEmployeeId', as: 'actorEmployee' });
    }
  }

  ApprovalHistory.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      requestType: {
        type: DataTypes.ENUM('leave_request', 'od_request', 'attendance_regularization', 'comp_off_credit'),
        allowNull: false,
      },
      requestId: { type: DataTypes.BIGINT, allowNull: false },
      action: { type: DataTypes.ENUM('approved', 'rejected'), allowNull: false },
      actorUserId: { type: DataTypes.BIGINT, allowNull: false },
      actorEmployeeId: { type: DataTypes.BIGINT, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      decidedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'ApprovalHistory',
      tableName: 'approval_histories',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(ApprovalHistory);

  return ApprovalHistory;
};

'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OdRequest extends Model {
    static associate(models) {
      OdRequest.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      OdRequest.belongsTo(models.Employee, { foreignKey: 'approverId', as: 'approver' });
      OdRequest.belongsTo(models.User, { foreignKey: 'approverUserId', as: 'approverUser' });
      OdRequest.hasMany(models.OdRequestApproval, { foreignKey: 'odRequestId', as: 'managerApprovals' });
    }
  }

  OdRequest.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      fromDate: { type: DataTypes.DATEONLY, allowNull: false },
      toDate: { type: DataTypes.DATEONLY, allowNull: false },
      purpose: { type: DataTypes.STRING, allowNull: false },
      location: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled', 'revoked'),
        allowNull: false,
        defaultValue: 'pending',
      },
      approverId: { type: DataTypes.BIGINT, allowNull: true },
      approverUserId: { type: DataTypes.BIGINT, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
      decisionMode: { type: DataTypes.ENUM('manager_consensus', 'admin_override'), allowNull: true },
      // Set when an admin reverts an approved request (status 'revoked') —
      // see odRequest.service.js::revokeOdRequest.
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      revokedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      revokeReason: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'OdRequest',
      tableName: 'od_requests',
      underscored: true,
      paranoid: true,
    }
  );

  return OdRequest;
};

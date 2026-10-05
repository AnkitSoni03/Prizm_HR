'use strict';

const { Model } = require('sequelize');

// One snapshotted manager's vote on a OdRequest — see the od_request_approvals migration.
module.exports = (sequelize, DataTypes) => {
  class OdRequestApproval extends Model {
    static associate(models) {
      OdRequestApproval.belongsTo(models.OdRequest, { foreignKey: 'odRequestId', as: 'odRequest' });
      OdRequestApproval.belongsTo(models.Employee, { foreignKey: 'managerEmployeeId', as: 'manager' });
    }
  }

  OdRequestApproval.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      odRequestId: { type: DataTypes.BIGINT, allowNull: false },
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
      modelName: 'OdRequestApproval',
      tableName: 'od_request_approvals',
      underscored: true,
      paranoid: true,
    }
  );

  return OdRequestApproval;
};

'use strict';

const { Model } = require('sequelize');

// One snapshotted manager's vote on a CompOffCredit — see the comp_off_credit_approvals migration.
module.exports = (sequelize, DataTypes) => {
  class CompOffCreditApproval extends Model {
    static associate(models) {
      CompOffCreditApproval.belongsTo(models.CompOffCredit, { foreignKey: 'compOffCreditId', as: 'compOffCredit' });
      CompOffCreditApproval.belongsTo(models.Employee, { foreignKey: 'managerEmployeeId', as: 'manager' });
    }
  }

  CompOffCreditApproval.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      compOffCreditId: { type: DataTypes.BIGINT, allowNull: false },
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
      modelName: 'CompOffCreditApproval',
      tableName: 'comp_off_credit_approvals',
      underscored: true,
      paranoid: true,
    }
  );

  return CompOffCreditApproval;
};

'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class PayslipRequest extends Model {
    static associate(models) {
      PayslipRequest.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      PayslipRequest.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      PayslipRequest.belongsTo(models.User, { foreignKey: 'decidedByUserId', as: 'decidedByUser' });
    }
  }

  PayslipRequest.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      // [{ year, month }]
      periods: { type: DataTypes.JSONB, allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      decidedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      decidedAt: { type: DataTypes.DATE, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PayslipRequest',
      tableName: 'payslip_requests',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(PayslipRequest);

  return PayslipRequest;
};

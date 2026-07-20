'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class PayrollRun extends Model {
    static associate(models) {
      PayrollRun.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      PayrollRun.belongsTo(models.User, { foreignKey: 'processedByUserId', as: 'processedByUser' });
      PayrollRun.belongsTo(models.User, { foreignKey: 'paidByUserId', as: 'paidByUser' });
      PayrollRun.hasMany(models.Payslip, { foreignKey: 'payrollRunId', as: 'payslips' });
      PayrollRun.hasMany(models.PayrollAdjustment, { foreignKey: 'payrollRunId', as: 'adjustments' });
    }
  }

  PayrollRun.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      periodMonth: { type: DataTypes.INTEGER, allowNull: false },
      periodYear: { type: DataTypes.INTEGER, allowNull: false },
      payPeriodStart: { type: DataTypes.DATEONLY, allowNull: false },
      payPeriodEnd: { type: DataTypes.DATEONLY, allowNull: false },
      status: {
        type: DataTypes.ENUM('draft', 'processed', 'paid', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft',
      },
      totalGross: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      totalDeductions: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      totalNet: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      processedAt: { type: DataTypes.DATE, allowNull: true },
      processedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      paidAt: { type: DataTypes.DATE, allowNull: true },
      paidByUserId: { type: DataTypes.BIGINT, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PayrollRun',
      tableName: 'payroll_runs',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(PayrollRun);

  return PayrollRun;
};

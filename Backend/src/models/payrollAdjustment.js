'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class PayrollAdjustment extends Model {
    static associate(models) {
      PayrollAdjustment.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      PayrollAdjustment.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      PayrollAdjustment.belongsTo(models.PayrollRun, { foreignKey: 'payrollRunId', as: 'payrollRun' });
      PayrollAdjustment.belongsTo(models.SalaryComponentDefinition, {
        foreignKey: 'componentDefinitionId',
        as: 'definition',
      });
      PayrollAdjustment.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdByUser' });
    }
  }

  PayrollAdjustment.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      payrollRunId: { type: DataTypes.BIGINT, allowNull: true },
      periodMonth: { type: DataTypes.INTEGER, allowNull: false },
      periodYear: { type: DataTypes.INTEGER, allowNull: false },
      componentDefinitionId: { type: DataTypes.BIGINT, allowNull: true },
      type: { type: DataTypes.ENUM('bonus', 'deduction'), allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'applied', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      createdByUserId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PayrollAdjustment',
      tableName: 'payroll_adjustments',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(PayrollAdjustment);

  return PayrollAdjustment;
};

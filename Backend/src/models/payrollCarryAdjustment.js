'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class PayrollCarryAdjustment extends Model {
    static associate(models) {
      PayrollCarryAdjustment.belongsTo(models.EmployeePayroll, { foreignKey: 'sourcePayrollId', as: 'sourcePayroll' });
      PayrollCarryAdjustment.belongsTo(models.EmployeePayroll, { foreignKey: 'targetPayrollId', as: 'targetPayroll' });
    }
  }

  PayrollCarryAdjustment.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      sourcePayrollId: { type: DataTypes.BIGINT, allowNull: false },
      sourceYear: { type: DataTypes.INTEGER, allowNull: false },
      sourceMonth: { type: DataTypes.INTEGER, allowNull: false },
      targetPayrollId: { type: DataTypes.BIGINT, allowNull: true },
      targetYear: { type: DataTypes.INTEGER, allowNull: true },
      targetMonth: { type: DataTypes.INTEGER, allowNull: true },
      amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        get() {
          const raw = this.getDataValue('amount');
          return raw === null || raw === undefined ? raw : Number(raw);
        },
      },
      status: { type: DataTypes.ENUM('pending', 'applied'), allowNull: false, defaultValue: 'pending' },
    },
    {
      sequelize,
      modelName: 'PayrollCarryAdjustment',
      tableName: 'payroll_carry_adjustments',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(PayrollCarryAdjustment);

  return PayrollCarryAdjustment;
};

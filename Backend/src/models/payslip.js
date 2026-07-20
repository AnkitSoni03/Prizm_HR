'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Payslip extends Model {
    static associate(models) {
      Payslip.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Payslip.belongsTo(models.PayrollRun, { foreignKey: 'payrollRunId', as: 'payrollRun' });
      Payslip.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      Payslip.belongsTo(models.EmployeeSalaryStructure, { foreignKey: 'salaryStructureId', as: 'salaryStructure' });
      Payslip.hasMany(models.PayslipComponent, { foreignKey: 'payslipId', as: 'components' });
    }
  }

  Payslip.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      payrollRunId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      salaryStructureId: { type: DataTypes.BIGINT, allowNull: true },
      workingDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      lopDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      payableDays: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      grossEarnings: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      totalDeductions: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      netPay: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      // Employer-side statutory contributions (PF/ESI employer share) —
      // informational only, never part of netPay.
      employerContributions: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      modelName: 'Payslip',
      tableName: 'payslips',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Payslip);

  return Payslip;
};

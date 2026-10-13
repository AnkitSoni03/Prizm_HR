'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

// Tenant-scoped by company_id (the employee's company). Group-level payroll
// managers work across companies, so the payroll services run their queries
// with the hook switched off (runAsCompany(null, …)) and filter on group_id.
module.exports = (sequelize, DataTypes) => {
  class SalaryAssignment extends Model {
    static associate(models) {
      SalaryAssignment.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      SalaryAssignment.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      SalaryAssignment.belongsTo(models.PayrollTemplate, { foreignKey: 'templateId', as: 'template' });
    }
  }

  SalaryAssignment.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      templateId: { type: DataTypes.BIGINT, allowNull: false },
      ctcPeriod: { type: DataTypes.ENUM('monthly', 'yearly'), allowNull: false },
      ctcAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      monthlyCtc: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
      effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
      deductionsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      disabledItems: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      status: { type: DataTypes.ENUM('active', 'superseded', 'ended'), allowNull: false, defaultValue: 'active' },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdByUserId: { type: DataTypes.BIGINT, allowNull: true },
      updatedByUserId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'SalaryAssignment',
      tableName: 'salary_assignments',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(SalaryAssignment);

  return SalaryAssignment;
};

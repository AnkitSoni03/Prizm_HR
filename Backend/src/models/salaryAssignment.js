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
      SalaryAssignment.belongsTo(models.Company, { foreignKey: 'ownerCompanyId', as: 'ownerCompany' });
      SalaryAssignment.belongsTo(models.Brand, { foreignKey: 'ownerBrandId', as: 'ownerBrand' });
    }
  }

  SalaryAssignment.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      templateId: { type: DataTypes.BIGINT, allowNull: false },
      grossPeriod: { type: DataTypes.ENUM('monthly', 'yearly'), allowNull: false },
      grossAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      monthlyGross: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
      effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
      deductionsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      disabledItems: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      status: { type: DataTypes.ENUM('active', 'superseded', 'ended'), allowNull: false, defaultValue: 'active' },
      note: { type: DataTypes.TEXT, allowNull: true },
      // The level that owns this salary (both NULL = Group): only it, or a
      // level above it, may change the employee's salary — see
      // payrollRelease.service.js for handing an employee down a level.
      ownerCompanyId: { type: DataTypes.BIGINT, allowNull: true },
      ownerBrandId: { type: DataTypes.BIGINT, allowNull: true },
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

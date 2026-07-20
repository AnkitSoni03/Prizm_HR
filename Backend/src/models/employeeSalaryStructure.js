'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class EmployeeSalaryStructure extends Model {
    static associate(models) {
      EmployeeSalaryStructure.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      EmployeeSalaryStructure.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      EmployeeSalaryStructure.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdByUser' });
      EmployeeSalaryStructure.hasMany(models.EmployeeSalaryComponent, {
        foreignKey: 'salaryStructureId',
        as: 'components',
      });
      EmployeeSalaryStructure.hasMany(models.Payslip, { foreignKey: 'salaryStructureId', as: 'payslips' });
    }
  }

  EmployeeSalaryStructure.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
      effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
      annualCtc: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      status: {
        type: DataTypes.ENUM('active', 'superseded'),
        allowNull: false,
        defaultValue: 'active',
      },
      createdByUserId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'EmployeeSalaryStructure',
      tableName: 'employee_salary_structures',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(EmployeeSalaryStructure);

  return EmployeeSalaryStructure;
};

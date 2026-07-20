'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class EmployeeSalaryComponent extends Model {
    static associate(models) {
      EmployeeSalaryComponent.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      EmployeeSalaryComponent.belongsTo(models.EmployeeSalaryStructure, {
        foreignKey: 'salaryStructureId',
        as: 'structure',
      });
      EmployeeSalaryComponent.belongsTo(models.SalaryComponentDefinition, {
        foreignKey: 'componentDefinitionId',
        as: 'definition',
      });
    }
  }

  EmployeeSalaryComponent.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      salaryStructureId: { type: DataTypes.BIGINT, allowNull: false },
      componentDefinitionId: { type: DataTypes.BIGINT, allowNull: false },
      calculationType: {
        type: DataTypes.ENUM('fixed_amount', 'percentage_of_component', 'formula'),
        allowNull: false,
      },
      value: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      resolvedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    },
    {
      sequelize,
      modelName: 'EmployeeSalaryComponent',
      tableName: 'employee_salary_components',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(EmployeeSalaryComponent);

  return EmployeeSalaryComponent;
};

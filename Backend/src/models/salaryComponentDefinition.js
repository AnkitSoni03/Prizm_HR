'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class SalaryComponentDefinition extends Model {
    static associate(models) {
      SalaryComponentDefinition.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      SalaryComponentDefinition.belongsTo(models.SalaryComponentDefinition, {
        foreignKey: 'percentageOfComponentId',
        as: 'percentageOfComponent',
      });
      SalaryComponentDefinition.hasMany(models.EmployeeSalaryComponent, {
        foreignKey: 'componentDefinitionId',
        as: 'structureComponents',
      });
    }
  }

  SalaryComponentDefinition.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      componentCategory: {
        type: DataTypes.ENUM('earning', 'deduction', 'reimbursement'),
        allowNull: false,
      },
      calculationType: {
        type: DataTypes.ENUM('fixed_amount', 'percentage_of_component', 'formula'),
        allowNull: false,
      },
      defaultValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      percentageOfComponentId: { type: DataTypes.BIGINT, allowNull: true },
      isStatutory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      taxable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      modelName: 'SalaryComponentDefinition',
      tableName: 'salary_component_definitions',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(SalaryComponentDefinition);

  return SalaryComponentDefinition;
};

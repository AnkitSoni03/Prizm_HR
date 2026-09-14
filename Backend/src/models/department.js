'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Department extends Model {
    static associate(models) {
      Department.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Department.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
      Department.belongsTo(models.Employee, { foreignKey: 'headEmployeeId', as: 'head' });
      Department.hasMany(models.Employee, { foreignKey: 'departmentId', as: 'employees' });
    }
  }

  Department.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      // NULL = shared across every Brand in the company. See utils/brandScope.js.
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: true },
      headEmployeeId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Department',
      tableName: 'departments',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Department);

  return Department;
};

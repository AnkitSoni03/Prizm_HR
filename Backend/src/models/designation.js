'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Designation extends Model {
    static associate(models) {
      Designation.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Designation.hasMany(models.Employee, { foreignKey: 'designationId', as: 'employees' });
    }
  }

  Designation.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      title: { type: DataTypes.STRING, allowNull: false },
      level: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Designation',
      tableName: 'designations',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Designation);

  return Designation;
};

'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Brand extends Model {
    static associate(models) {
      Brand.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Brand.hasMany(models.Employee, { foreignKey: 'brandId', as: 'employees' });
      Brand.hasMany(models.UserRole, { foreignKey: 'brandId', as: 'userRoles' });
      Brand.hasMany(models.Invitation, { foreignKey: 'brandId', as: 'invitations' });
      Brand.hasMany(models.ShiftRoster, { foreignKey: 'brandId', as: 'rosterEntries' });
    }
  }

  Brand.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: true },
      address: { type: DataTypes.STRING, allowNull: true },
      city: { type: DataTypes.STRING, allowNull: true },
      state: { type: DataTypes.STRING, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'Brand',
      tableName: 'brands',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Brand);

  return Brand;
};

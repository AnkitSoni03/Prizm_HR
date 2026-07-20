'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Holiday extends Model {
    static associate(models) {
      Holiday.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Holiday.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
      Holiday.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
      Holiday.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'updater' });
    }
  }

  Holiday.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      type: {
        type: DataTypes.ENUM('public', 'optional'),
        allowNull: false,
        defaultValue: 'public',
      },
      // "make sure mention there name as a proof" — who created/last edited
      // this holiday. Shown on the Company Admin/HR-facing Holidays page
      // only; the ESS "Yearly Holidays" page reads the same list endpoint
      // but simply doesn't render these fields.
      createdBy: { type: DataTypes.BIGINT, allowNull: true },
      updatedBy: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Holiday',
      tableName: 'holidays',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Holiday);

  return Holiday;
};

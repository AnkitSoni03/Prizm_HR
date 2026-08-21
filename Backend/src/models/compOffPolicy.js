'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class CompOffPolicy extends Model {
    static associate(models) {
      CompOffPolicy.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      CompOffPolicy.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
      CompOffPolicy.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'updater' });
      CompOffPolicy.hasMany(models.Employee, { foreignKey: 'compOffPolicyId', as: 'employees' });
    }
  }

  CompOffPolicy.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      expiryDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 90 },
      // If true, credits earned under this policy never expire — see
      // compOff.service.js::checkAndCreateCompOffCredit (stores
      // expiryDate: null for them) and the migration that made
      // comp_off_credits.expiry_date nullable.
      carryForward: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.BIGINT, allowNull: true },
      updatedBy: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'CompOffPolicy',
      tableName: 'comp_off_policies',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(CompOffPolicy);

  return CompOffPolicy;
};

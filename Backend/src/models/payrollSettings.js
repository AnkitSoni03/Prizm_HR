'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class PayrollSettings extends Model {
    static associate(models) {
      PayrollSettings.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
    }
  }

  PayrollSettings.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      payCycleStartDay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      enableStatutoryDeductions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      statutoryConfig: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'INR' },
    },
    {
      sequelize,
      modelName: 'PayrollSettings',
      tableName: 'payroll_settings',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(PayrollSettings);

  return PayrollSettings;
};

'use strict';

const { Model } = require('sequelize');

// Deliberately NOT tenant-scoped (same as kiosk_locations): a Group-level
// template is shared by every company in the Group; `targets` narrows it to
// chosen companies / brands. Every query filters on group_id explicitly
// (visibility / edit rights: payrollAccess.js template target helpers).
module.exports = (sequelize, DataTypes) => {
  class PayrollTemplate extends Model {
    static associate(models) {
      PayrollTemplate.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
      PayrollTemplate.hasMany(models.SalaryAssignment, { foreignKey: 'templateId', as: 'assignments' });
    }
  }

  PayrollTemplate.init(
    {
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      // Who it's for (migration 20261021090100): [{ companyId, brandId }] —
      // brandId null = the whole company; null / [] = the whole Group.
      targets: { type: DataTypes.JSONB, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      // Shape: modules/payroll/payrollRules.js
      rules: { type: DataTypes.JSONB, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdByUserId: { type: DataTypes.BIGINT, allowNull: true },
      updatedByUserId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PayrollTemplate',
      tableName: 'payroll_templates',
      underscored: true,
      paranoid: true,
    }
  );

  return PayrollTemplate;
};

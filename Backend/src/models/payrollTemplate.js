'use strict';

const { Model } = require('sequelize');

// Group-level, no company_id — deliberately NOT tenant-scoped (same as
// kiosk_locations): a template is shared by every company in the Group.
// Every query filters on group_id explicitly.
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

'use strict';

const { Model } = require('sequelize');

// Group-level, not tenant-scoped (see payrollTemplate.js). kind 'earning' =
// a recurring allowance inside gross (migration 20261014090000). Applies only
// to the employees chosen on it (payroll_custom_item_employees).
module.exports = (sequelize, DataTypes) => {
  class PayrollCustomItem extends Model {
    static associate(models) {
      PayrollCustomItem.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
      PayrollCustomItem.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      PayrollCustomItem.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
      PayrollCustomItem.hasMany(models.PayrollCustomItemEmployee, { foreignKey: 'customItemId', as: 'members' });
    }
  }

  PayrollCustomItem.init(
    {
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      // Owner level (migration 20261021090000): both null = Group, companyId =
      // that Company + its Brands, brandId = that Brand only.
      companyId: { type: DataTypes.BIGINT, allowNull: true },
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
      kind: { type: DataTypes.ENUM('deduction', 'employer_contribution', 'earning'), allowNull: false },
      calcType: { type: DataTypes.ENUM('percent', 'fixed'), allowNull: false },
      basis: { type: DataTypes.ENUM('basic', 'gross'), allowNull: true },
      value: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      // null = every month; ['2026-10', '2026-12'] = only those months.
      months: { type: DataTypes.JSONB, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdByUserId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PayrollCustomItem',
      tableName: 'payroll_custom_items',
      underscored: true,
      paranoid: true,
    }
  );

  return PayrollCustomItem;
};

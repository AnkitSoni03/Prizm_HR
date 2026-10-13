'use strict';

const { Model } = require('sequelize');

// Group-level, not tenant-scoped (see payrollTemplate.js).
module.exports = (sequelize, DataTypes) => {
  class PayrollCustomItem extends Model {
    static associate(models) {
      PayrollCustomItem.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
    }
  }

  PayrollCustomItem.init(
    {
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      kind: { type: DataTypes.ENUM('deduction', 'employer_contribution'), allowNull: false },
      calcType: { type: DataTypes.ENUM('percent', 'fixed'), allowNull: false },
      basis: { type: DataTypes.ENUM('basic', 'gross', 'ctc'), allowNull: true },
      value: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
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

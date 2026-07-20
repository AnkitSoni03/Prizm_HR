'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Plan extends Model {
    static associate(models) {
      Plan.hasMany(models.Group, { foreignKey: 'planId', as: 'groups' });
      Plan.hasMany(models.Company, { foreignKey: 'planId', as: 'companies' });
    }
  }

  Plan.init(
    {
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      billingCycle: {
        type: DataTypes.ENUM('monthly', 'yearly'),
        allowNull: false,
        defaultValue: 'monthly',
      },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'Plan',
      tableName: 'plans',
      underscored: true,
      paranoid: true,
    }
  );

  return Plan;
};

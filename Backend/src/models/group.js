'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Group extends Model {
    static associate(models) {
      Group.belongsTo(models.Plan, { foreignKey: 'planId', as: 'plan' });
      Group.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
      Group.hasMany(models.Company, { foreignKey: 'groupId', as: 'companies' });
      Group.hasMany(models.User, { foreignKey: 'groupId', as: 'users' });
      Group.hasMany(models.UserRole, { foreignKey: 'groupId', as: 'userRoles' });
      Group.hasMany(models.Invitation, { foreignKey: 'groupId', as: 'invitations' });
    }
  }

  Group.init(
    {
      name: { type: DataTypes.STRING, allowNull: false },
      status: {
        type: DataTypes.ENUM('active', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
      },
      planId: { type: DataTypes.BIGINT, allowNull: true },
      createdBy: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Group',
      tableName: 'groups',
      underscored: true,
      paranoid: true,
    }
  );

  return Group;
};

'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Permission extends Model {
    static associate(models) {
      Permission.belongsToMany(models.Role, {
        through: models.RolePermission,
        foreignKey: 'permissionId',
        otherKey: 'roleId',
        as: 'roles',
      });
    }
  }

  Permission.init(
    {
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      module: { type: DataTypes.STRING, allowNull: true },
      description: { type: DataTypes.STRING, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Permission',
      tableName: 'permissions',
      underscored: true,
      paranoid: true,
    }
  );

  return Permission;
};

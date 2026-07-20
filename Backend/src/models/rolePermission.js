'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RolePermission extends Model {
    static associate(models) {
      RolePermission.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
      RolePermission.belongsTo(models.Permission, {
        foreignKey: 'permissionId',
        as: 'permission',
      });
    }
  }

  RolePermission.init(
    {
      roleId: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
      permissionId: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
    },
    {
      sequelize,
      modelName: 'RolePermission',
      tableName: 'role_permissions',
      underscored: true,
      paranoid: true,
    }
  );

  return RolePermission;
};

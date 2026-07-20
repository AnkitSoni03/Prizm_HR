'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      Role.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Role.belongsToMany(models.Permission, {
        through: models.RolePermission,
        foreignKey: 'roleId',
        otherKey: 'permissionId',
        as: 'permissions',
      });
      Role.hasMany(models.UserRole, { foreignKey: 'roleId', as: 'userRoles' });
      Role.hasMany(models.Invitation, { foreignKey: 'roleId', as: 'invitations' });
    }
  }

  Role.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
      isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      description: { type: DataTypes.STRING, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Role',
      tableName: 'roles',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Role);

  return Role;
};

'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class UserRole extends Model {
    static associate(models) {
      UserRole.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      UserRole.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
      UserRole.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      UserRole.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
      UserRole.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
    }
  }

  UserRole.init(
    {
      userId: { type: DataTypes.BIGINT, allowNull: false },
      roleId: { type: DataTypes.BIGINT, allowNull: false },
      companyId: { type: DataTypes.BIGINT, allowNull: true },
      groupId: { type: DataTypes.BIGINT, allowNull: true },
      brandId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'UserRole',
      tableName: 'user_roles',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(UserRole);

  return UserRole;
};

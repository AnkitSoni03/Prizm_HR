'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      User.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
      User.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      User.hasMany(models.UserRole, { foreignKey: 'userId', as: 'userRoles' });
      User.hasMany(models.RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
      User.hasMany(models.PasswordReset, { foreignKey: 'userId', as: 'passwordResets' });
      User.hasMany(models.Group, { foreignKey: 'createdBy', as: 'createdGroups' });
      User.hasMany(models.Company, { foreignKey: 'createdBy', as: 'createdCompanies' });
      User.hasOne(models.Employee, { foreignKey: 'userId', as: 'employeeAccount' });
    }
  }

  User.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: true },
      groupId: { type: DataTypes.BIGINT, allowNull: true },
      employeeId: { type: DataTypes.BIGINT, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: false },
      passwordHash: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('invited', 'active', 'disabled'),
        allowNull: false,
        defaultValue: 'invited',
      },
      invitedAt: { type: DataTypes.DATE, allowNull: true },
      activatedAt: { type: DataTypes.DATE, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      twoFaEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(User);

  return User;
};

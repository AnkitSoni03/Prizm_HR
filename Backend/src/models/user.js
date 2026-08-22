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
      // AES-256-GCM ciphertext of the current plaintext password — only
      // ever set for Scanner/kiosk accounts (see
      // officeKiosk.service.js::createScannerAccount/
      // resetScannerAccountPassword, src/utils/kioskCredentials.js).
      // passwordHash above remains the sole source of truth for actual
      // login on every account, including Scanner; this is a separate,
      // additional copy purely so an admin can reveal a kiosk's current
      // password again later, a deliberate exception to this app's usual
      // never-recoverable-password rule, requested specifically for these
      // machine accounts.
      kioskPasswordEncrypted: { type: DataTypes.TEXT, allowNull: true },
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
      // Embedded in every refresh JWT at issue time (tokens.js::signRefreshToken)
      // and checked against on every /auth/refresh call — bumping this
      // instantly invalidates every outstanding refresh token for this user
      // across all devices, without a session table to revoke rows in.
      tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      // GCS object path (private bucket), same convention as
      // employees.photo_url — only meaningful for admin-only accounts with
      // no linked Employee row (an ESS employee's photo lives on the
      // Employee record instead; see auth.service.js::getCurrentUser).
      photoUrl: { type: DataTypes.STRING, allowNull: true },
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

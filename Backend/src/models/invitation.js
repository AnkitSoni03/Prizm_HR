'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Invitation extends Model {
    static associate(models) {
      Invitation.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Invitation.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
      Invitation.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
      Invitation.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
    }
  }

  Invitation.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: true },
      groupId: { type: DataTypes.BIGINT, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: false },
      roleId: { type: DataTypes.BIGINT, allowNull: false },
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      tokenHash: { type: DataTypes.STRING, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      acceptedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Invitation',
      tableName: 'invitations',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Invitation);

  return Invitation;
};

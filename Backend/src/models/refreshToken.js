'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RefreshToken extends Model {
    static associate(models) {
      RefreshToken.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    }
  }

  RefreshToken.init(
    {
      userId: { type: DataTypes.BIGINT, allowNull: false },
      tokenHash: { type: DataTypes.STRING, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'RefreshToken',
      tableName: 'refresh_tokens',
      underscored: true,
      paranoid: true,
    }
  );

  return RefreshToken;
};

'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PasswordReset extends Model {
    static associate(models) {
      PasswordReset.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    }
  }

  PasswordReset.init(
    {
      userId: { type: DataTypes.BIGINT, allowNull: false },
      tokenHash: { type: DataTypes.STRING, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      usedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PasswordReset',
      tableName: 'password_resets',
      underscored: true,
      paranoid: true,
    }
  );

  return PasswordReset;
};

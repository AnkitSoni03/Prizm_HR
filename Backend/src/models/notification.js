'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Notification.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    }
  }

  Notification.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      userId: { type: DataTypes.BIGINT, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: false },
      requestType: {
        type: DataTypes.ENUM('leave_request', 'od_request', 'attendance_regularization', 'comp_off_credit'),
        allowNull: true,
      },
      requestId: { type: DataTypes.BIGINT, allowNull: true },
      title: { type: DataTypes.STRING, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: true },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      readAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notifications',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Notification);

  return Notification;
};

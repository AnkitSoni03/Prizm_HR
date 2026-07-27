'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class PendingAttendance extends Model {
    static associate(models) {
      PendingAttendance.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      PendingAttendance.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
      PendingAttendance.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      PendingAttendance.belongsTo(models.User, { foreignKey: 'kioskUserId', as: 'kioskUser' });
    }
  }

  PendingAttendance.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      kioskUserId: { type: DataTypes.BIGINT, allowNull: false },
      action: { type: DataTypes.ENUM('checkin', 'checkout'), allowNull: false },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'expired'),
        allowNull: false,
        defaultValue: 'pending',
      },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: 'PendingAttendance',
      tableName: 'pending_attendances',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(PendingAttendance);

  return PendingAttendance;
};

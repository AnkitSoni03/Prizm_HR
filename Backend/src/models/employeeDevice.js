'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeDevice extends Model {
    static associate(models) {
      EmployeeDevice.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      EmployeeDevice.hasMany(models.Attendance, { foreignKey: 'deviceId', as: 'attendanceRecords' });
    }
  }

  EmployeeDevice.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      deviceFingerprint: { type: DataTypes.STRING, allowNull: false },
      credentialId: { type: DataTypes.STRING, allowNull: false },
      publicKey: { type: DataTypes.TEXT, allowNull: false },
      registeredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
      signatureCounter: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('active', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
    },
    {
      sequelize,
      modelName: 'EmployeeDevice',
      tableName: 'employee_devices',
      underscored: true,
      paranoid: true,
    }
  );

  return EmployeeDevice;
};

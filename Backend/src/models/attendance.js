'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Attendance extends Model {
    static associate(models) {
      Attendance.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      Attendance.belongsTo(models.EmployeeDevice, { foreignKey: 'deviceId', as: 'device' });
      Attendance.belongsTo(models.QrAttendanceTerminal, { foreignKey: 'terminalId', as: 'terminal' });
      Attendance.hasMany(models.AttendanceRegularization, { foreignKey: 'attendanceId', as: 'regularizations' });
    }
  }

  Attendance.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      checkIn: { type: DataTypes.DATE, allowNull: true },
      checkOut: { type: DataTypes.DATE, allowNull: true },
      source: { type: DataTypes.ENUM('qr', 'od'), allowNull: true },
      deviceId: { type: DataTypes.BIGINT, allowNull: true },
      terminalId: { type: DataTypes.BIGINT, allowNull: true },
      qrTokenJti: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('present', 'absent', 'half_day', 'leave', 'holiday', 'weekoff', 'on_duty'),
        allowNull: false,
        defaultValue: 'absent',
      },
      overtimeMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      modelName: 'Attendance',
      tableName: 'attendance',
      underscored: true,
      paranoid: true,
    }
  );

  return Attendance;
};

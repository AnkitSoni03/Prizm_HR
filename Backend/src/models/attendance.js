'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Attendance extends Model {
    static associate(models) {
      Attendance.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      Attendance.belongsTo(models.User, { foreignKey: 'kioskUserId', as: 'kioskUser' });
      Attendance.belongsTo(models.KioskLocation, { foreignKey: 'kioskLocationId', as: 'kioskLocation' });
      Attendance.hasMany(models.AttendanceRegularization, { foreignKey: 'attendanceId', as: 'regularizations' });
    }
  }

  Attendance.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      checkIn: { type: DataTypes.DATE, allowNull: true },
      checkOut: { type: DataTypes.DATE, allowNull: true },
      // 'qr'/'office_kiosk' are historical values only — both check-in
      // mechanisms that wrote them have been retired in favor of face
      // recognition; existing rows keep displaying correctly, nothing new
      // is ever created with those values again.
      source: { type: DataTypes.ENUM('qr', 'od', 'office_kiosk', 'face'), allowNull: true },
      kioskUserId: { type: DataTypes.BIGINT, allowNull: true },
      // Which physical kiosk location the punch was taken at (group-level
      // kiosk accounts each define one or more; a device claims exactly one
      // at sign-in). Null for non-kiosk sources and pre-feature rows.
      kioskLocationId: { type: DataTypes.BIGINT, allowNull: true },
      videoObjectPathCheckin: { type: DataTypes.STRING, allowNull: true },
      videoObjectPathCheckout: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('present', 'absent', 'half_day', 'leave', 'holiday', 'weekoff', 'on_duty'),
        allowNull: false,
        defaultValue: 'absent',
      },
      overtimeMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      // Checked in but not checked out within the 12h30m window
      // (utils/shiftTime.js). Status stays as-is; cleared once a
      // regularization supplies the check-out.
      checkoutMissed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
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

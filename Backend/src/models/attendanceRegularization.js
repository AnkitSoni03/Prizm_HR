'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AttendanceRegularization extends Model {
    static associate(models) {
      AttendanceRegularization.belongsTo(models.Attendance, { foreignKey: 'attendanceId', as: 'attendance' });
      AttendanceRegularization.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      AttendanceRegularization.belongsTo(models.Employee, { foreignKey: 'approverId', as: 'approver' });
      AttendanceRegularization.belongsTo(models.User, { foreignKey: 'approverUserId', as: 'approverUser' });
    }
  }

  AttendanceRegularization.init(
    {
      attendanceId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      requestedStatus: {
        type: DataTypes.ENUM('present', 'absent', 'half_day', 'leave', 'holiday', 'weekoff', 'on_duty'),
        allowNull: false,
      },
      reason: { type: DataTypes.STRING, allowNull: false },
      // Optional — the employee's own claimed check-in/check-out instant for
      // this date (e.g. "I was actually here at 10:00, the kiosk just never
      // caught it"). Applied onto the Attendance row's own checkIn/checkOut
      // at approval time (see attendanceRegularization.service.js), and
      // overridable by the approver before approving.
      requestedCheckIn: { type: DataTypes.DATE, allowNull: true },
      requestedCheckOut: { type: DataTypes.DATE, allowNull: true },
      approverId: { type: DataTypes.BIGINT, allowNull: true },
      approverUserId: { type: DataTypes.BIGINT, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
    },
    {
      sequelize,
      modelName: 'AttendanceRegularization',
      tableName: 'attendance_regularizations',
      underscored: true,
      paranoid: true,
    }
  );

  return AttendanceRegularization;
};

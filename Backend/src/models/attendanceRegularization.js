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
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'revoked'),
        allowNull: false,
        defaultValue: 'pending',
      },
      // The attendance row's values just before approval overwrote them —
      // what revokeRegularization restores. Null previousStatus = approved
      // before this snapshot existed (can't be reverted).
      previousStatus: { type: DataTypes.STRING, allowNull: true },
      previousCheckIn: { type: DataTypes.DATE, allowNull: true },
      previousCheckOut: { type: DataTypes.DATE, allowNull: true },
      previousCheckoutMissed: { type: DataTypes.BOOLEAN, allowNull: true },
      // Set when an admin reverts an approved request (status 'revoked').
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      revokedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      revokeReason: { type: DataTypes.TEXT, allowNull: true },
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

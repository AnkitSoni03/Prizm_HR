'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CompOffCredit extends Model {
    static associate(models) {
      CompOffCredit.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      CompOffCredit.belongsTo(models.Employee, { foreignKey: 'approverId', as: 'approver' });
      CompOffCredit.belongsTo(models.User, { foreignKey: 'approverUserId', as: 'approverUser' });
      CompOffCredit.belongsTo(models.Attendance, { foreignKey: 'sourceAttendanceId', as: 'sourceAttendance' });
      CompOffCredit.hasOne(models.LeaveRequest, { foreignKey: 'compOffCreditId', as: 'consumedByLeaveRequest' });
    }
  }

  CompOffCredit.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      sourceAttendanceId: { type: DataTypes.BIGINT, allowNull: false },
      earnedDate: { type: DataTypes.DATEONLY, allowNull: false },
      status: {
        type: DataTypes.ENUM('pending_approval', 'approved', 'rejected', 'expired', 'used'),
        allowNull: false,
        defaultValue: 'pending_approval',
      },
      approverId: { type: DataTypes.BIGINT, allowNull: true },
      approverUserId: { type: DataTypes.BIGINT, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
      expiryDate: { type: DataTypes.DATEONLY, allowNull: false },
    },
    {
      sequelize,
      modelName: 'CompOffCredit',
      tableName: 'comp_off_credits',
      underscored: true,
      paranoid: true,
    }
  );

  return CompOffCredit;
};

'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LeaveRequest extends Model {
    static associate(models) {
      LeaveRequest.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      LeaveRequest.belongsTo(models.Employee, { foreignKey: 'approverId', as: 'approver' });
      LeaveRequest.belongsTo(models.User, { foreignKey: 'approverUserId', as: 'approverUser' });
      LeaveRequest.belongsTo(models.User, { foreignKey: 'revokedByUserId', as: 'revokedByUser' });
      LeaveRequest.belongsTo(models.LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });
      LeaveRequest.belongsTo(models.LeaveType, { foreignKey: 'balanceLeaveTypeId', as: 'balanceLeaveType' });
      LeaveRequest.belongsTo(models.CompOffCredit, { foreignKey: 'compOffCreditId', as: 'compOffCredit' });
      // Per-manager decision rows for the multi-manager approval workflow —
      // a snapshot of the employee's managers taken at submission time. See
      // leaveRequestApproval.js and leaveRequest.service.js::createLeaveRequest.
      LeaveRequest.hasMany(models.LeaveRequestApproval, { foreignKey: 'leaveRequestId', as: 'managerApprovals' });
    }
  }

  LeaveRequest.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      leaveTypeId: { type: DataTypes.BIGINT, allowNull: false },
      fromDate: { type: DataTypes.DATEONLY, allowNull: false },
      toDate: { type: DataTypes.DATEONLY, allowNull: false },
      days: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      reason: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled', 'revoked'),
        allowNull: false,
        defaultValue: 'pending',
      },
      approverId: { type: DataTypes.BIGINT, allowNull: true },
      approverUserId: { type: DataTypes.BIGINT, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
      compOffCreditId: { type: DataTypes.BIGINT, allowNull: true },
      // Set only for a half-day (0.5-deduction linked type) request.
      halfDaySession: { type: DataTypes.ENUM('first_half', 'second_half'), allowNull: true },
      // The leave type whose balance this request was charged against -
      // NULL means leaveTypeId itself (see leaveRequest.service.js::
      // balanceTypeIdOf).
      balanceLeaveTypeId: { type: DataTypes.BIGINT, allowNull: true },
      // 'manager_consensus' (every manager approved) vs 'admin_override' (a
      // company/brand-wide admin bypassed the manager chain entirely) — see
      // the 20260905090200 migration comment.
      decisionMode: { type: DataTypes.ENUM('manager_consensus', 'admin_override'), allowNull: true },
      // Set when an admin reverts an approved request (status 'revoked') �
      // see leaveRequest.service.js::revokeLeaveRequest.
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      revokedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      revokeReason: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'LeaveRequest',
      tableName: 'leave_requests',
      underscored: true,
      paranoid: true,
    }
  );

  return LeaveRequest;
};

'use strict';

// An admin can revert an already-approved leave request
// (leaveRequest.service.js::revokeLeaveRequest): the balance / comp-off
// credit / attendance rows go back to how they were before approval, and the
// request itself ends up 'revoked' — distinct from 'cancelled' (the employee
// withdrawing a still-pending request). The audit trail gets a matching
// 'revoked' action. Who/why/when also sit on the row itself so the request
// card can show them without loading the history.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_leave_requests_status" ADD VALUE IF NOT EXISTS 'revoked';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_approval_histories_action" ADD VALUE IF NOT EXISTS 'revoked';`
    );
    await queryInterface.addColumn('leave_requests', 'revoked_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('leave_requests', 'revoked_by_user_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('leave_requests', 'revoke_reason', { type: Sequelize.TEXT, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_requests', 'revoke_reason');
    await queryInterface.removeColumn('leave_requests', 'revoked_by_user_id');
    await queryInterface.removeColumn('leave_requests', 'revoked_at');
    // Enum values can't be dropped in Postgres — same as 20260805090100.
  },
};

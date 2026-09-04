'use strict';

// Per-manager decision tracking for the multi-manager leave-approval
// workflow — a SNAPSHOT of the employee's manager set taken at submission
// time (leaveRequest.service.js::createLeaveRequest), one row per manager.
// Deliberately a snapshot, not a live re-derivation: if the employee's
// managers change after they've already applied, the set of people deciding
// THIS request must stay stable and unambiguous (no one is silently added
// to or dropped from an in-flight decision).
//
// The request only finalizes as 'approved' once every row here is
// 'approved' (leaveRequest.service.js::decideLeaveRequestAsManager); any
// single 'rejected' finalizes the whole request as rejected immediately —
// the other managers' rows are left exactly as they were (a still-'pending'
// row on an already-rejected request is not a bug, it's the honest record
// that manager never got to decide). 'bypassed' marks a still-pending row
// when a company/brand-wide admin override finalized the request first —
// see leave_requests.decision_mode.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leave_request_approvals', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      leave_request_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'leave_requests', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      manager_employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'bypassed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      decided_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('leave_request_approvals', ['leave_request_id', 'manager_employee_id'], {
      unique: true,
      name: 'leave_request_approvals_request_manager_active_idx',
      where: { deleted_at: null },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('leave_request_approvals');
  },
};

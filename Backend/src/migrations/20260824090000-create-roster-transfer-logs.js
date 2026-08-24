'use strict';

// Immutable audit trail for the "Change Roster" carry-forward decision
// (rosterTransfer.service.js) — separate from approval_histories since this
// isn't an approve/reject on a submitted request, it's an admin-initiated
// balance movement, and needs a JSONB breakdown per leave type rather than
// a single action/reason pair. CLAUDE.md rule 5: "Audit everything
// sensitive" — a roster change can zero out or relocate real leave balance.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('roster_transfer_logs', {
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
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // Nullable: an employee's first-ever Roster assignment has no "from".
      from_roster_group_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'roster_groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      // Nullable: un-assigning back to company/brand-wide defaults.
      to_roster_group_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'roster_groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      carry_forward: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },
      actor_user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      // Per-leave-type breakdown of what happened: [{ leaveTypeId,
      // leaveTypeName, action: 'kept'|'reset'|'moved_to_carry_forward',
      // previousBalance, newAllotted?, carryForwardAmount?,
      // carryForwardLeaveTypeId? }] — see rosterTransfer.service.js.
      details: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
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

    await queryInterface.addIndex('roster_transfer_logs', ['company_id', 'employee_id'], {
      name: 'roster_transfer_logs_company_id_employee_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('roster_transfer_logs');
  },
};

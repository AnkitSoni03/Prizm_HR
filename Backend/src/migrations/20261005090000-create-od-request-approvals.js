'use strict';

// Per-manager decision tracking for multi-manager OD approval.
// Same shape and semantics as leave_request_approvals (see its migration):
// a SNAPSHOT of the employee's full manager set (primary + additional, any
// company of the Group) taken when the item enters its pending state, one
// row per manager. Approved only once every row is 'approved'; any single
// 'rejected' finalizes it as rejected; 'bypassed' marks a still-pending row
// when a company/brand-wide admin decided it first.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('od_request_approvals', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      od_request_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'od_requests', key: 'id' },
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
      reason: { type: Sequelize.TEXT, allowNull: true },
      decided_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deleted_at: { allowNull: true, type: Sequelize.DATE },
    });

    await queryInterface.addIndex('od_request_approvals', ['od_request_id', 'manager_employee_id'], {
      unique: true,
      name: 'od_request_approvals_request_manager_active_idx',
      where: { deleted_at: null },
    });
    await queryInterface.addIndex('od_request_approvals', ['manager_employee_id'], { name: 'od_request_approvals_manager_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('od_request_approvals');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_od_request_approvals_status";');
  },
};

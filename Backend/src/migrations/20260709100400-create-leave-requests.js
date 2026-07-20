'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leave_requests', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      leave_type_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'leave_types', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      from_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      to_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      days: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      reason: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      approver_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      // Set only for leave_type CO (comp-off) requests, linking to the
      // credit it consumes. comp_off_credits is created after this table
      // (it references attendance, which itself depends on nothing here),
      // so the FK constraint is added later by the deferred-FK migration —
      // same circular-dependency pattern as Phase-1's deferred columns.
      comp_off_credit_id: {
        type: Sequelize.BIGINT,
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

    await queryInterface.addIndex('leave_requests', ['employee_id', 'status'], {
      name: 'leave_requests_employee_id_status_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('leave_requests');
  },
};

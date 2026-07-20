'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('approval_histories', {
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
      // Which decision-bearing table request_id points into — kept as a
      // plain enum rather than 4 separate nullable FK columns since exactly
      // one of these ever applies per row and the set mirrors the four
      // existing approve/reject workflows (leave, OD, regularization, comp-off).
      request_type: {
        type: Sequelize.ENUM('leave_request', 'od_request', 'attendance_regularization', 'comp_off_credit'),
        allowNull: false,
      },
      request_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      action: {
        type: Sequelize.ENUM('approved', 'rejected'),
        allowNull: false,
      },
      // Always set from req.auth.userId — unlike the pre-existing
      // approver_id (Employee FK) on each of the four tables, this is never
      // null: a Company/Brand/Group Admin approving without an Employee
      // record of their own still has a User row.
      actor_user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      actor_employee_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      decided_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
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

    await queryInterface.addIndex('approval_histories', ['request_type', 'request_id'], {
      name: 'approval_histories_request_idx',
    });
    await queryInterface.addIndex('approval_histories', ['company_id'], {
      name: 'approval_histories_company_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('approval_histories');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_approval_histories_request_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_approval_histories_action";');
  },
};

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('comp_off_credits', {
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
      // The holiday/weekoff attendance row that earned this credit.
      source_attendance_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'attendance', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      earned_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending_approval', 'approved', 'rejected', 'expired', 'used'),
        allowNull: false,
        defaultValue: 'pending_approval',
      },
      approver_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      expiry_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
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

    // One credit per source attendance row — a given worked holiday/weekoff
    // day can only earn comp-off once.
    await queryInterface.addIndex('comp_off_credits', ['source_attendance_id'], {
      unique: true,
      name: 'comp_off_credits_source_attendance_id_unique',
    });
    // Supports the daily expiry sweep ("approved rows past expiry_date") and
    // the leave-request consumption lookup ("oldest approved, unexpired
    // credit for this employee").
    await queryInterface.addIndex('comp_off_credits', ['employee_id', 'status', 'expiry_date'], {
      name: 'comp_off_credits_employee_id_status_expiry_date_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('comp_off_credits');
  },
};

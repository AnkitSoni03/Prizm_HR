'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('attendance_regularizations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      attendance_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'attendance', key: 'id' },
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
      requested_status: {
        type: Sequelize.ENUM('present', 'absent', 'half_day', 'leave', 'holiday', 'weekoff', 'on_duty'),
        allowNull: false,
      },
      reason: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      approver_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('attendance_regularizations');
  },
};

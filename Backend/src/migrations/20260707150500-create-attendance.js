'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('attendance', {
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
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      check_in: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      check_out: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      source: {
        type: Sequelize.ENUM('qr', 'od'),
        allowNull: true,
      },
      device_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employee_devices', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      terminal_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'qr_attendance_terminals', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      qr_token_jti: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('present', 'absent', 'half_day', 'leave', 'holiday', 'weekoff', 'on_duty'),
        allowNull: false,
        defaultValue: 'absent',
      },
      overtime_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    // One attendance row per employee per business date (the shift's
    // effective date for night shifts, not necessarily the calendar date of
    // the punch — see PHASE3_MODELS.md's check-in/out flow notes).
    await queryInterface.addIndex('attendance', ['employee_id', 'date'], {
      unique: true,
      name: 'attendance_employee_id_date_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('attendance');
  },
};

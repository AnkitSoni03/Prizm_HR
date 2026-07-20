'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employee_shifts', {
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
      shift_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      effective_from: {
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

    // The active default shift for an employee as of a given date is "the
    // row with the latest effective_from <= that date" — index supports
    // that lookup pattern.
    await queryInterface.addIndex('employee_shifts', ['employee_id', 'effective_from'], {
      name: 'employee_shifts_employee_id_effective_from_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employee_shifts');
  },
};

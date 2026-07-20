'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leave_balances', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      // No company_id of its own — tenant isolation is derived through
      // employee_id -> employees.company_id at the service/query layer,
      // same as attendance and shift_rosters.
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
        onDelete: 'CASCADE',
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      allotted: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      used: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      balance: {
        type: Sequelize.DECIMAL(5, 2),
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

    await queryInterface.addIndex('leave_balances', ['employee_id', 'leave_type_id', 'year'], {
      unique: true,
      name: 'leave_balances_employee_id_leave_type_id_year_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('leave_balances');
  },
};

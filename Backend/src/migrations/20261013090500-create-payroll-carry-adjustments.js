'use strict';

// Difference between a month's corrected net pay and what was already
// credited for it (employee_payrolls.original_net), carried into the next
// payroll generated after the correction: positive = arrears paid, negative =
// recovery. 'pending' until a month picks it up, then 'applied' with the
// target month recorded.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payroll_carry_adjustments', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      source_payroll_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employee_payrolls', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      source_year: { type: Sequelize.INTEGER, allowNull: false },
      source_month: { type: Sequelize.INTEGER, allowNull: false },
      target_payroll_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employee_payrolls', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      target_year: { type: Sequelize.INTEGER, allowNull: true },
      target_month: { type: Sequelize.INTEGER, allowNull: true },
      amount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'applied'), allowNull: false, defaultValue: 'pending' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('payroll_carry_adjustments', ['employee_id', 'status']);
    await queryInterface.addIndex('payroll_carry_adjustments', ['source_payroll_id']);
    await queryInterface.addIndex('payroll_carry_adjustments', ['target_payroll_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payroll_carry_adjustments');
  },
};

'use strict';

// One-time extra pay for one employee in one month (bonus, incentive,
// overtime, reimbursement…) — a fixed amount, or a % of that month's monthly
// Basic / Gross / CTC (amount then = the resolved figure, kept in step with
// the month's payroll). Paid on top of the salary — outside CTC, never
// cut for LOP, no PF/ESI/PT on it. `taxable` decides whether it counts for
// TDS. Adding/editing/deleting one for a month that's already generated
// recalculates that month (the difference reaches the next salary as
// arrears/recovery, like any other correction).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payroll_bonuses', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'groups', key: 'id' },
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
      period_year: { type: Sequelize.INTEGER, allowNull: false },
      period_month: { type: Sequelize.INTEGER, allowNull: false },
      type: {
        type: Sequelize.ENUM('bonus', 'incentive', 'overtime', 'reimbursement', 'other'),
        allowNull: false,
      },
      title: { type: Sequelize.STRING(120), allowNull: true },
      calc_type: { type: Sequelize.ENUM('fixed', 'percent'), allowNull: false, defaultValue: 'fixed' },
      // Only for calc_type 'percent'.
      percent: { type: Sequelize.DECIMAL(7, 2), allowNull: true },
      basis: { type: Sequelize.ENUM('basic', 'gross', 'ctc'), allowNull: true },
      amount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      taxable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      created_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      updated_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('payroll_bonuses', ['employee_id', 'period_year', 'period_month']);
    await queryInterface.addIndex('payroll_bonuses', ['group_id', 'period_year', 'period_month']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payroll_bonuses');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payroll_bonuses_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payroll_bonuses_calc_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payroll_bonuses_basis";');
  },
};

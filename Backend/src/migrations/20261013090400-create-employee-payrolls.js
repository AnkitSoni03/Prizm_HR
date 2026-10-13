'use strict';

// One row per employee per completed month — generated on the 1st of the next
// month (jobs/payrollGeneration.job.js), never for the running month.
// Recalculated in place whenever something behind it changes later (a late
// leave approval, a regularization, a salary correction, …): `revision`
// counts recalculations and `revised_at` is printed on the payslip.
// `original_net` is what was first generated (treated as credited to the
// bank); any later difference is carried into the next month as an arrears /
// recovery line (payroll_carry_adjustments). `rules_snapshot` freezes the
// template at first generation so a later template edit doesn't rewrite
// history — corrections recalculate with it.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employee_payrolls', {
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
      assignment_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'salary_assignments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      period_year: { type: Sequelize.INTEGER, allowNull: false },
      period_month: { type: Sequelize.INTEGER, allowNull: false },
      period_start: { type: Sequelize.DATEONLY, allowNull: false },
      period_end: { type: Sequelize.DATEONLY, allowNull: false },
      month_days: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      paid_days: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      lop_days: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      monthly_ctc: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      gross_full: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      gross_earned: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      total_deductions: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      total_employer: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      carry_adjustment: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      net_pay: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      original_net: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      details: { type: Sequelize.JSONB, allowNull: false },
      rules_snapshot: { type: Sequelize.JSONB, allowNull: false },
      revision: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      revised_at: { type: Sequelize.DATE, allowNull: true },
      generated_at: { type: Sequelize.DATE, allowNull: false },
      needs_recalc: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      payslip_released: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      released_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('employee_payrolls', ['group_id', 'period_year', 'period_month']);
    await queryInterface.addIndex('employee_payrolls', ['company_id', 'period_year', 'period_month']);
    await queryInterface.addIndex('employee_payrolls', ['needs_recalc']);
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX employee_payrolls_one_per_month ON employee_payrolls (employee_id, period_year, period_month) WHERE deleted_at IS NULL;'
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employee_payrolls');
  },
};

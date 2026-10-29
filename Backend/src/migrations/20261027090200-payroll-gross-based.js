'use strict';

// Salaries are entered as monthly GROSS, not CTC (explicit ask, 2026-10-27):
// Basic = % of gross, employee deductions come out of gross, and employer
// contributions are the company's cost on top of it. No real salary data
// existed yet, so amounts are kept as they are and simply read as gross.
//   salary_assignments: ctc_period / ctc_amount / monthly_ctc
//                       → gross_period / gross_amount / monthly_gross
//   employee_payrolls:  monthly_ctc → monthly_gross (= the month's full gross)
//   payroll_templates.rules: basicPercentOfCtc → basicPercentOfGross
//   payroll_bonuses / payroll_custom_items: a % of 'ctc' becomes a % of 'gross'
//   (the 'ctc' enum value stays in the type — Postgres can't drop one — but
//   nothing writes it anymore).
async function renameIfPresent(queryInterface, table, from, to) {
  const columns = await queryInterface.describeTable(table);
  if (columns[from] && !columns[to]) await queryInterface.renameColumn(table, from, to);
}

module.exports = {
  async up(queryInterface) {
    await renameIfPresent(queryInterface, 'salary_assignments', 'ctc_period', 'gross_period');
    await renameIfPresent(queryInterface, 'salary_assignments', 'ctc_amount', 'gross_amount');
    await renameIfPresent(queryInterface, 'salary_assignments', 'monthly_ctc', 'monthly_gross');
    await renameIfPresent(queryInterface, 'employee_payrolls', 'monthly_ctc', 'monthly_gross');
    await queryInterface.sequelize.query('UPDATE employee_payrolls SET monthly_gross = gross_full');
    await queryInterface.sequelize.query(`
      UPDATE payroll_templates
         SET rules = (rules - 'basicPercentOfCtc') || jsonb_build_object('basicPercentOfGross', rules->'basicPercentOfCtc')
       WHERE rules ? 'basicPercentOfCtc'
    `);
    await queryInterface.sequelize.query("UPDATE payroll_bonuses SET basis = 'gross' WHERE basis = 'ctc'");
    await queryInterface.sequelize.query("UPDATE payroll_custom_items SET basis = 'gross' WHERE basis = 'ctc'");
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE payroll_templates
         SET rules = (rules - 'basicPercentOfGross') || jsonb_build_object('basicPercentOfCtc', rules->'basicPercentOfGross')
       WHERE rules ? 'basicPercentOfGross'
    `);
    await renameIfPresent(queryInterface, 'employee_payrolls', 'monthly_gross', 'monthly_ctc');
    await renameIfPresent(queryInterface, 'salary_assignments', 'monthly_gross', 'monthly_ctc');
    await renameIfPresent(queryInterface, 'salary_assignments', 'gross_amount', 'ctc_amount');
    await renameIfPresent(queryInterface, 'salary_assignments', 'gross_period', 'ctc_period');
  },
};

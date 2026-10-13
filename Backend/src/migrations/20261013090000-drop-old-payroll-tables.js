'use strict';

// The company-level Payroll module (Phase-5, 2026-07-17 → 2026-07-30) is
// replaced wholesale by the group-level salary-template payroll
// (modules/payroll/). Explicitly requested: the old tables and their data are
// removed completely, not migrated. Dependents first; CASCADE also clears any
// FK that still points at them.
const TABLES = [
  'payslip_components',
  'payslips',
  'payroll_adjustments',
  'payroll_runs',
  'employee_salary_components',
  'employee_salary_structures',
  'salary_component_definitions',
  'payroll_settings',
];

module.exports = {
  async up(queryInterface) {
    for (const table of TABLES) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
    }
    // Sequelize names each ENUM column's type enum_<table>_<column>.
    const likeClauses = TABLES.map((table) => `typname LIKE 'enum_${table}_%'`).join(' OR ');
    const [types] = await queryInterface.sequelize.query(
      `SELECT typname FROM pg_type WHERE typtype = 'e' AND (${likeClauses});`
    );
    for (const { typname } of types) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${typname}";`);
    }
  },

  async down() {
    throw new Error('The old payroll tables were removed on purpose and cannot be restored by a migration.');
  },
};

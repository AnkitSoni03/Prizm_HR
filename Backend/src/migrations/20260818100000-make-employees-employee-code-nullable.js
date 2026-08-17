'use strict';

// Explicit ask: Super Admin's "name only" employee creation must not
// auto-generate a code either — the employee has no employeeCode at all
// until Company Admin/Brand Admin sets one (employeeCode is now part of
// employee.service.js::UPDATABLE_FIELDS). The existing unique index on
// (company_id, employee_code) is unaffected — Postgres treats NULL as
// distinct, so any number of code-less employees can coexist in the same
// company without violating it.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE employees ALTER COLUMN employee_code DROP NOT NULL');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE employees ALTER COLUMN employee_code SET NOT NULL');
  },
};

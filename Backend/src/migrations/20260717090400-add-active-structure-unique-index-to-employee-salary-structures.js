'use strict';

// Partial unique index — first use of this pattern in the codebase (Postgres
// compiles Sequelize's addIndex `where` option to a real partial index).
// Guarantees at most one status='active' salary structure per employee at
// the DB level; salaryStructure.service.js also checks this inside the same
// transaction as defense-in-depth, matching how this codebase generally
// treats DB constraints as backup rather than the sole guard.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addIndex('employee_salary_structures', ['employee_id'], {
      unique: true,
      name: 'employee_salary_structures_one_active_per_employee',
      where: { status: 'active' },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'employee_salary_structures',
      'employee_salary_structures_one_active_per_employee'
    );
  },
};

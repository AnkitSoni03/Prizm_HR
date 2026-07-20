'use strict';

// Run-level rollup, same nullable-until-processed shape as the existing
// totalGross/totalDeductions/totalNet columns (null for a draft run, set
// once processRun completes).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payroll_runs', 'total_employer_contributions', {
      type: Sequelize.DECIMAL(14, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('payroll_runs', 'total_employer_contributions');
  },
};

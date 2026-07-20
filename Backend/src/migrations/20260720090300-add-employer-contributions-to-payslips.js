'use strict';

// Rollup of this payslip's employer-side statutory contributions (PF
// employer share, ESI employer share) — informational only, never part of
// netPay. Defaults to 0 so every pre-existing payslip (and every company
// with statutory deductions still disabled) reads as zero, not null.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payslips', 'employer_contributions', {
      type: Sequelize.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('payslips', 'employer_contributions');
  },
};

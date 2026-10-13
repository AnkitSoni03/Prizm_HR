'use strict';

// The month's one-time extras (payroll_bonuses) — already inside net_pay;
// kept as its own column for list totals.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employee_payrolls', 'bonus_total', {
      type: Sequelize.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employee_payrolls', 'bonus_total');
  },
};

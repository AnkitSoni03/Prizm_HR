'use strict';

// % based bonuses (calc_type / percent / basis). 20261014090100 already
// creates these on a fresh database; this adds them where that migration ran
// before they existed.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('payroll_bonuses');
    if (!table.calc_type) {
      await queryInterface.addColumn('payroll_bonuses', 'calc_type', {
        type: Sequelize.ENUM('fixed', 'percent'),
        allowNull: false,
        defaultValue: 'fixed',
      });
    }
    if (!table.percent) {
      await queryInterface.addColumn('payroll_bonuses', 'percent', { type: Sequelize.DECIMAL(7, 2), allowNull: true });
    }
    if (!table.basis) {
      await queryInterface.addColumn('payroll_bonuses', 'basis', { type: Sequelize.ENUM('basic', 'gross', 'ctc'), allowNull: true });
    }
  },

  async down() {
    // Left in place — 20261014090100 owns these columns on a fresh database.
  },
};

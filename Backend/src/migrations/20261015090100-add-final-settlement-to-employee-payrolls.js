'use strict';

// A month whose salary ends inside it (salary ended / last working day) is a
// final settlement: paid only up to final_date, and generated as soon as that
// date has come — not at the month's end.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('employee_payrolls');
    if (!table.is_final) {
      await queryInterface.addColumn('employee_payrolls', 'is_final', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    }
    if (!table.final_date) {
      await queryInterface.addColumn('employee_payrolls', 'final_date', { type: Sequelize.DATEONLY, allowNull: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employee_payrolls', 'final_date');
    await queryInterface.removeColumn('employee_payrolls', 'is_final');
  },
};

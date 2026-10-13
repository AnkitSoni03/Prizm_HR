'use strict';

// An extra allowance / deduction / employer contribution can be limited to
// chosen months (['2026-10', '2026-12']); null = every month.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('payroll_custom_items');
    if (!table.months) {
      await queryInterface.addColumn('payroll_custom_items', 'months', { type: Sequelize.JSONB, allowNull: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('payroll_custom_items', 'months');
  },
};

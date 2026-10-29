'use strict';

// employee_payrolls.locked_at: a payroll manager locks a month once its
// salary is paid. Until then a recalculation simply changes the month; after
// it the difference goes to arrears / recovery in the next month.
// Months generated before this existed were already treated as paid, so they
// start locked — their behaviour doesn't change.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('employee_payrolls');
    if (!table.locked_at) {
      await queryInterface.addColumn('employee_payrolls', 'locked_at', { type: Sequelize.DATE, allowNull: true });
    }
    if (!table.locked_by_user_id) {
      await queryInterface.addColumn('employee_payrolls', 'locked_by_user_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      });
    }
    await queryInterface.sequelize.query('UPDATE employee_payrolls SET locked_at = generated_at WHERE locked_at IS NULL');
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employee_payrolls', 'locked_by_user_id');
    await queryInterface.removeColumn('employee_payrolls', 'locked_at');
  },
};

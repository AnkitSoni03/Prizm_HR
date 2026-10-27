'use strict';

// payroll_carry_adjustments.kind: 'correction' (a paid month changed later —
// what existed so far) or 'shortfall' (what a month couldn't recover because
// in-hand now stops at zero; recovered from the next salary).
// employees.last_working_date: asked when an admin marks an employee exited /
// archived or inactive — payroll stops paying after it.
module.exports = {
  async up(queryInterface, Sequelize) {
    const carries = await queryInterface.describeTable('payroll_carry_adjustments');
    if (!carries.kind) {
      await queryInterface.addColumn('payroll_carry_adjustments', 'kind', {
        type: Sequelize.ENUM('correction', 'shortfall'),
        allowNull: false,
        defaultValue: 'correction',
      });
    }
    const employees = await queryInterface.describeTable('employees');
    if (!employees.last_working_date) {
      await queryInterface.addColumn('employees', 'last_working_date', { type: Sequelize.DATEONLY, allowNull: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'last_working_date');
    await queryInterface.removeColumn('payroll_carry_adjustments', 'kind');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payroll_carry_adjustments_kind"');
  },
};

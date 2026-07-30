'use strict';

// Snapshots salary_component_definitions.taxable at payslip-generation time
// (same double-snapshot principle as calculation_type/resolved_amount on
// employee_salary_components) — needed by TDS's year-to-date taxable-gross
// reconstruction so a later edit to a component definition's taxable flag
// can never retroactively change a historical payslip. Defaults to true so
// every pre-existing row (all generated before the taxable flag had any
// consumer) is treated as taxable, matching the column's own default.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payslip_components', 'taxable', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('payslip_components', 'taxable');
  },
};

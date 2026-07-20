'use strict';

// Marks which of a company's own earning components (typically Basic, DA)
// count toward the PF wage basis. Components are an arbitrary company-defined
// catalog, so there's no way to know "which one is Basic" without an
// explicit flag like this — used by statutoryDeduction.service.js via
// payrollRun.service.js's existing per-segment earning loop.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('salary_component_definitions', 'is_pf_wage', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('salary_component_definitions', 'is_pf_wage');
  },
};

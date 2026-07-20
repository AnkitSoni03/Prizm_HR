'use strict';

// Needed for Professional Tax slab lookup (state-specific in India) — no
// employee identity/location field like this existed anywhere in the schema
// before now. Nullable free text, not an ENUM: statutoryDeduction.service.js
// falls back to a 'default' PT slab for any unrecognized/blank value, so
// this never needs to gate on a fixed state list.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'work_state', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'work_state');
  },
};

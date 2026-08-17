'use strict';

// Explicit ask: Company Admin/Brand Admin should also capture an employee's
// date of birth when filling in their details. Nullable — same "optional,
// filled in whenever available" treatment as workState, not a hard
// requirement like dateOfJoining already is.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'date_of_birth', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'date_of_birth');
  },
};

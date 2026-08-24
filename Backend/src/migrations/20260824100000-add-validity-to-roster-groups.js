'use strict';

// Optional validity period for a Roster Group — e.g. "6 months". Both
// columns null (the default for every existing Roster) means "no expiry",
// unchanged behavior. The period is NOT anchored to the Roster itself but to
// each employee's own assignment date (employees.roster_assigned_at, next
// migration) — the same 6-month Roster assigned to two different employees
// on two different dates expires on two different dates for each of them.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('roster_groups', 'validity_value', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('roster_groups', 'validity_unit', {
      type: Sequelize.ENUM('days', 'months'),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('roster_groups', 'validity_unit');
    await queryInterface.removeColumn('roster_groups', 'validity_value');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_roster_groups_validity_unit";');
  },
};

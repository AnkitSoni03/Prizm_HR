'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Default false preserves current behaviour for every existing
    // department; Company Admin/Super Admin opt a specific department in
    // via the Department form, which then drives hrTeamSync.js's automatic
    // HR Team role grant for every employee assigned to it.
    await queryInterface.addColumn('departments', 'is_hr_department', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('departments', 'is_hr_department');
  },
};

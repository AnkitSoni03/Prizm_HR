'use strict';

// PHASE4_MODELS.md's working-day/comp-off logic needs to know which
// days-of-week are off for a shift, but no Phase-3 table modeled this.
// Stored as an array of ISO day-of-week ints matching JS Date#getDay()
// (0 = Sunday ... 6 = Saturday), e.g. [0] for a standard Sun-off week.
// Empty array = no weekly off (matches existing shifts, which default here).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('shifts', 'weekly_off_days', {
      type: Sequelize.ARRAY(Sequelize.INTEGER),
      allowNull: false,
      defaultValue: [],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('shifts', 'weekly_off_days');
  },
};

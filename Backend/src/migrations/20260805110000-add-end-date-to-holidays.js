'use strict';

// Turns a Holiday from "one row = one day" into "one row = one date range"
// (date..end_date, inclusive) — a multi-day festival/shutdown is now a
// single row instead of one row per calendar day, so the UI can show it as
// one entry with a day count instead of N repeated rows.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('holidays', 'end_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });

    // Backfill every existing (necessarily single-day, from before this
    // migration) row so end_date === date.
    await queryInterface.sequelize.query('UPDATE holidays SET end_date = date WHERE end_date IS NULL');

    await queryInterface.changeColumn('holidays', 'end_date', {
      type: Sequelize.DATEONLY,
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('holidays', 'end_date');
  },
};

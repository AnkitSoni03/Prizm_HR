'use strict';

// Which physical kiosk location the punch was taken at. Nullable: rows
// written before group-level kiosk locations existed have none, and a punch
// from any non-kiosk source (od, regularization) never will.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('attendance', 'kiosk_location_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'kiosk_locations', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('attendance', 'kiosk_location_id');
  },
};

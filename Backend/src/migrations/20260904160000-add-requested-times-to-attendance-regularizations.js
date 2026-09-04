'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('attendance_regularizations', 'requested_check_in', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('attendance_regularizations', 'requested_check_out', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('attendance_regularizations', 'requested_check_in');
    await queryInterface.removeColumn('attendance_regularizations', 'requested_check_out');
  },
};

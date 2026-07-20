'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employee_devices', 'signature_counter', {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employee_devices', 'signature_counter');
  },
};

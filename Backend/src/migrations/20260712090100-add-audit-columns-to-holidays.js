'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('holidays', 'created_by', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn('holidays', 'updated_by', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('holidays', 'updated_by');
    await queryInterface.removeColumn('holidays', 'created_by');
  },
};

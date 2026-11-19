'use strict';

const { DataTypes } = require('sequelize');

// employees.custom_power_brands — { powerKey: [brandId, ...] } for each
// Company-level power limited to some brands of the employee's company (one
// brand-scoped UserRole per chosen brand); absent = every brand.
//
// Its own migration because 20261119090000 was already applied on some
// databases before this column was added to it. Skips the column if it
// already exists, so it is safe either way.
module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('employees');
    if (!columns.custom_power_brands) {
      await queryInterface.addColumn('employees', 'custom_power_brands', {
        type: DataTypes.JSONB,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'custom_power_brands');
  },
};

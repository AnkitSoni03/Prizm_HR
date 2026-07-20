'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Existing companies were all Brand-scoped before this feature existed,
    // so default true preserves current behaviour for every row already in
    // the table; new companies choose explicitly at creation time (Super
    // Admin "Add Company" wizard).
    await queryInterface.addColumn('companies', 'uses_brands', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('companies', 'uses_brands');
  },
};

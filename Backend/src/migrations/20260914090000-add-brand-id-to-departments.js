'use strict';

const { DataTypes } = require('sequelize');

// NULL = shared across every Brand in the company (unchanged behavior for
// every existing row). A caller scoped to one or more specific Brands
// (Brand Admin) only ever sees/manages company-wide rows plus their own
// Brand's — see department.service.js.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('departments', 'brand_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('departments', ['company_id', 'brand_id'], {
      name: 'departments_company_id_brand_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('departments', 'departments_company_id_brand_id_idx');
    await queryInterface.removeColumn('departments', 'brand_id');
  },
};

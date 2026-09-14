'use strict';

const { DataTypes } = require('sequelize');

// Same brand-optional convention as departments (see that migration).
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('comp_off_policies', 'brand_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('comp_off_policies', ['company_id', 'brand_id'], {
      name: 'comp_off_policies_company_id_brand_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('comp_off_policies', 'comp_off_policies_company_id_brand_id_idx');
    await queryInterface.removeColumn('comp_off_policies', 'brand_id');
  },
};

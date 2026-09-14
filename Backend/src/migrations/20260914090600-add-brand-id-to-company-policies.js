'use strict';

const { DataTypes } = require('sequelize');

// Same brand-optional convention as departments (see that migration).
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('company_policies', 'brand_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('company_policies', ['company_id', 'brand_id'], {
      name: 'company_policies_company_id_brand_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('company_policies', 'company_policies_company_id_brand_id_idx');
    await queryInterface.removeColumn('company_policies', 'brand_id');
  },
};

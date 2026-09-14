'use strict';

const { DataTypes } = require('sequelize');

// Same brand-optional convention as departments (see that migration).
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('designations', 'brand_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('designations', ['company_id', 'brand_id'], {
      name: 'designations_company_id_brand_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('designations', 'designations_company_id_brand_id_idx');
    await queryInterface.removeColumn('designations', 'brand_id');
  },
};

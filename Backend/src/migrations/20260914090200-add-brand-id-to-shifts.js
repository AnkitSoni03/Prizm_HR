'use strict';

const { DataTypes } = require('sequelize');

// Same brand-optional convention as departments (see that migration).
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('shifts', 'brand_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('shifts', ['company_id', 'brand_id'], {
      name: 'shifts_company_id_brand_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('shifts', 'shifts_company_id_brand_id_idx');
    await queryInterface.removeColumn('shifts', 'brand_id');
  },
};

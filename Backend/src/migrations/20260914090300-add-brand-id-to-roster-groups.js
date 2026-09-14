'use strict';

const { DataTypes } = require('sequelize');

// Same brand-optional convention as departments (see that migration).
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('roster_groups', 'brand_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('roster_groups', ['company_id', 'brand_id'], {
      name: 'roster_groups_company_id_brand_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('roster_groups', 'roster_groups_company_id_brand_id_idx');
    await queryInterface.removeColumn('roster_groups', 'brand_id');
  },
};

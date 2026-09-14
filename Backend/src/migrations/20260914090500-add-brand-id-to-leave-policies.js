'use strict';

const { DataTypes } = require('sequelize');

// Same brand-optional convention as departments (see that migration).
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('leave_policies', 'brand_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'brands', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('leave_policies', ['company_id', 'brand_id'], {
      name: 'leave_policies_company_id_brand_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('leave_policies', 'leave_policies_company_id_brand_id_idx');
    await queryInterface.removeColumn('leave_policies', 'brand_id');
  },
};

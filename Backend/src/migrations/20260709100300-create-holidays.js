'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('holidays', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // NULL = applies to every Brand in the company.
      brand_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'brands', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM('public', 'optional'),
        allowNull: false,
        defaultValue: 'public',
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });

    // Supports the working-day/comp-off lookup: "is `date` a holiday for
    // this company (and this brand, or company-wide)".
    await queryInterface.addIndex('holidays', ['company_id', 'brand_id', 'date'], {
      name: 'holidays_company_id_brand_id_date_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('holidays');
  },
};

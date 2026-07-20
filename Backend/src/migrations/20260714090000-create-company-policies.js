'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('company_policies', {
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
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Plain URL string, same convention as employee_documents.file_url —
      // no real file-upload backend exists anywhere in this app.
      file_url: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      updated_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
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

    await queryInterface.addIndex('company_policies', ['company_id'], {
      name: 'company_policies_company_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('company_policies');
  },
};

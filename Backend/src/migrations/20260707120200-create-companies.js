'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('companies', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      legal_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      gst_number: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('trial', 'active', 'grace', 'suspended', 'terminated'),
        allowNull: false,
        defaultValue: 'trial',
      },
      plan_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'plans', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      // FK -> users.id added later in 20260707121600-add-deferred-foreign-keys.js:
      // users.company_id -> companies, so users must be created after companies.
      created_by: {
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('companies');
  },
};

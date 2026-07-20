'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
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
      // FK -> employees.id added later in 20260707121600-add-deferred-foreign-keys.js:
      // employees doesn't exist yet (employees.user_id -> users).
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('invited', 'active', 'disabled'),
        allowNull: false,
        defaultValue: 'invited',
      },
      invited_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      activated_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      two_fa_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      last_login_at: {
        type: Sequelize.DATE,
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

    // Email must be unique per tenant, not globally.
    await queryInterface.addIndex('users', ['company_id', 'email'], {
      unique: true,
      name: 'users_company_id_email_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};

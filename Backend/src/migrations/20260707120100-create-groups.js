'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('groups', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('active', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
      },
      plan_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'plans', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      // FK -> users.id added later in 20260707121600-add-deferred-foreign-keys.js:
      // users doesn't exist yet at this point (users.company_id -> companies -> groups).
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
    await queryInterface.dropTable('groups');
  },
};

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employee_devices', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      device_fingerprint: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      credential_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      public_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      registered_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('active', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
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

    // WebAuthn credential IDs are globally unique per authenticator.
    await queryInterface.addIndex('employee_devices', ['credential_id'], {
      unique: true,
      name: 'employee_devices_credential_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employee_devices');
  },
};

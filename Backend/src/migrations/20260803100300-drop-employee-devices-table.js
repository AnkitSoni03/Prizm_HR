'use strict';

// WebAuthn passkey device storage — retired along with the QR/WebAuthn
// check-in mechanism it existed for (face recognition replaces it,
// no fallback kept). Must run after
// 20260803100200-drop-qr-webauthn-columns-from-attendance.js, which already
// dropped attendance.device_id's FK reference to this table.
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('employee_devices');
  },

  async down(queryInterface, Sequelize) {
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
      signature_counter: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.addIndex('employee_devices', ['credential_id'], {
      unique: true,
      name: 'employee_devices_credential_id_unique',
    });
  },
};

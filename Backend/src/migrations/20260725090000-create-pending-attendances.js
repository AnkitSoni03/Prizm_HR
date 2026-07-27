'use strict';

// Durable "scanned but not yet biometric-confirmed" record for the office
// kiosk flow — mirrors the attendance_regularizations/od_requests two-phase
// shape (create a pending row, confirm/complete it later) rather than
// keeping this state in Redis only, so an abandoned scan is auditable and
// sweepable by a cron job instead of silently vanishing.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pending_attendances', {
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
      brand_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'brands', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      kiosk_user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      action: {
        type: Sequelize.ENUM('checkin', 'checkout'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'expired'),
        allowNull: false,
        defaultValue: 'pending',
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
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

    // The expiry sweep job scans for status='pending' past expires_at.
    await queryInterface.addIndex('pending_attendances', ['status', 'expires_at'], {
      name: 'pending_attendances_status_expires_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pending_attendances');
  },
};

'use strict';

// pending_attendances existed solely to bridge the old office-kiosk flow's
// two-network-round-trip gap (QR scan by phone -> time passes -> WebAuthn
// confirm), needing a durable, sweepable "abandoned scan" record. The
// face-recognition flow is one continuous client-side operation ending in
// exactly one POST /attendance/face-checkin call that either fully succeeds
// or fully fails — there is no "started but never finished" state to
// persist, so this table (and its expiry cron,
// jobs/pendingAttendanceExpiry.job.js, deleted alongside this migration)
// has no remaining purpose.
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('pending_attendances');
  },

  async down(queryInterface, Sequelize) {
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

    await queryInterface.addIndex('pending_attendances', ['status', 'expires_at'], {
      name: 'pending_attendances_status_expires_at_idx',
    });
  },
};

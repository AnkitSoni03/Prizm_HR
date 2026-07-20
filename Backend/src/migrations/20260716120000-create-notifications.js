'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
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
      // The recipient. Every notification is addressed to exactly one User —
      // "notify everyone who can approve X" fans out to one row per
      // recipient (see utils/notifications.js::notifyApprovers) rather than
      // a shared row with a join table, keeping unread-count/mark-read
      // trivial single-row operations.
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // 'approval_decision' (a request the recipient submitted was
      // approved/rejected) or 'approval_pending' (a new request needs the
      // recipient's decision) — the only two kinds wired up today, kept as a
      // plain string rather than an enum so a future notification type
      // doesn't need a migration to add.
      type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      request_type: {
        type: Sequelize.ENUM('leave_request', 'od_request', 'attendance_regularization', 'comp_off_credit'),
        allowNull: true,
      },
      request_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_read: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      read_at: {
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

    // The bell's two hot queries: "my unread count" and "my notification
    // list", both always filtered to one user.
    await queryInterface.addIndex('notifications', ['user_id', 'is_read'], {
      name: 'notifications_user_unread_idx',
    });
    await queryInterface.addIndex('notifications', ['company_id'], {
      name: 'notifications_company_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_request_type";');
  },
};

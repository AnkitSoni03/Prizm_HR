'use strict';

// Refresh tokens are now stateless signed JWTs (see
// src/utils/tokens.js::signRefreshToken/verifyRefreshToken), validated by
// signature + expiry + users.token_version (added in the migration just
// before this one) instead of a DB-backed session row per token. down()
// recreates the table verbatim from 20260707120800-create-refresh-tokens.js
// for reversibility, but any rows it held are gone for good — they were
// never anything but opaque session handles, not data worth preserving.
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('refresh_tokens', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token_hash: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      revoked_at: {
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
  },
};

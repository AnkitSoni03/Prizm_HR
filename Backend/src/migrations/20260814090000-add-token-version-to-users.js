'use strict';

// Replaces the refresh_tokens table (see the sibling
// 20260814090100-drop-refresh-tokens migration) as the mechanism for
// server-side session invalidation. Refresh tokens are now stateless signed
// JWTs carrying the tokenVersion they were issued under (see
// src/utils/tokens.js::signRefreshToken) — a refresh JWT is only honored if
// its embedded tokenVersion still matches this column. Bumping it (done by
// resetPassword/transferEmployeeLogin) instantly invalidates every
// outstanding refresh token for that user, everywhere, without needing a
// row-per-session table to look up or revoke.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'token_version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'token_version');
  },
};

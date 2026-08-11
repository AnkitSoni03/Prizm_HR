'use strict';

// Backs the "reveal password" action on the Kiosk Accounts page — an
// explicit, deliberate exception to this app's usual "every credential is
// one-way bcrypt-hashed, never recoverable" rule, requested specifically
// for Scanner/kiosk machine accounts (not real people's logins). Holds an
// AES-256-GCM ciphertext of the account's current plaintext password (see
// src/utils/kioskCredentials.js) — null for every account created before
// this migration, and for every non-Scanner user forever (only
// officeKiosk.service.js's createScannerAccount/resetScannerAccountPassword
// ever write to this column). users.password_hash (bcrypt) remains the sole
// source of truth for actual login on every account, including Scanner —
// this column is a separate, additional copy purely for the reveal UI.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'kiosk_password_encrypted', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'kiosk_password_encrypted');
  },
};

'use strict';

// The QR-terminal (device_id/terminal_id) and old-QR (qr_token_jti) check-in
// mechanisms are being fully retired in favor of face recognition (no
// fallback kept — user-confirmed decision). Must run before the migrations
// that drop employee_devices/qr_attendance_terminals themselves, since
// those tables are what these columns' FKs point at.
//
// Lossy for historical rows: any pre-existing attendance row's forensic
// link to the specific device/terminal/token that created it is gone after
// this runs. videoObjectPathCheckin/Checkout remains as the actual retained
// audit trail, and no surviving code reads these three columns once the
// old QR/WebAuthn service files are deleted — an accepted, informed
// trade-off, not an oversight.
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('attendance', 'qr_token_jti');
    await queryInterface.removeColumn('attendance', 'terminal_id');
    await queryInterface.removeColumn('attendance', 'device_id');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('attendance', 'device_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'employee_devices', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('attendance', 'terminal_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'qr_attendance_terminals', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('attendance', 'qr_token_jti', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};

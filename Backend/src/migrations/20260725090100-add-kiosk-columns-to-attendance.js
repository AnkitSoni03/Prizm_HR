'use strict';

// Office kiosk flow additions: which Scanner-role kiosk account triggered
// the video capture, and the GCS object paths for the resulting clips.
// terminal_id/device_id/qr_token_jti/source are untouched — the old
// terminal-secretKey flow stays dormant, not removed.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('attendance', 'kiosk_user_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('attendance', 'video_object_path_checkin', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('attendance', 'video_object_path_checkout', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('attendance', 'video_object_path_checkout');
    await queryInterface.removeColumn('attendance', 'video_object_path_checkin');
    await queryInterface.removeColumn('attendance', 'kiosk_user_id');
  },
};

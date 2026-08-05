'use strict';

// Companion to 20260805090000: an admin directly setting an attendance
// status isn't an "approve"/"reject" decision on a submitted request, so it
// needs its own action value on the same audit trail.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_approval_histories_action" ADD VALUE IF NOT EXISTS 'corrected';`
    );
  },

  async down() {
    // No-op — see 20260805090000's down() for why.
  },
};

'use strict';

// A manually-created comp-off credit (compOff.service.js::createCompOffCredit)
// isn't an "approve"/"reject" decision on a submitted request — it's the
// grant itself — so it needs its own action value on the same audit trail.
// Same standalone-ALTER-TYPE pattern as 20260805090100's 'corrected' value.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_approval_histories_action" ADD VALUE IF NOT EXISTS 'granted';`
    );
  },

  async down() {
    // No-op — see 20260805090000's down() for why.
  },
};

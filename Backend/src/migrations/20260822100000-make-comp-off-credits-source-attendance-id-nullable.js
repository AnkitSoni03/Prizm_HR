'use strict';

// A comp-off credit manually granted via the "Assign Comp-Off" power (see
// compOff.service.js::createCompOffCredit) has no worked holiday/weekoff
// attendance row behind it — only the auto-detected path
// (checkAndCreateCompOffCredit) has a real source_attendance_id. Same
// nullable-for-a-new-use-case pattern as 20260821100200's expiry_date change.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('comp_off_credits', 'source_attendance_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('comp_off_credits', 'source_attendance_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
    });
  },
};

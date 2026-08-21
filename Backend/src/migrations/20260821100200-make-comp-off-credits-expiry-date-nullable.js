'use strict';

// A credit earned under a carry-forward-enabled Comp-Off Policy never
// expires — expressed as expiry_date: NULL rather than a synthetic far-future
// date, so compOffExpiry.job.js's sweep (WHERE expiry_date < today) and
// leaveRequest.service.js's redemption lookup need only a NULL-aware
// comparison, no separate "is this a carry-forward credit" branch anywhere.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('comp_off_credits', 'expiry_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('comp_off_credits', 'expiry_date', {
      type: Sequelize.DATEONLY,
      allowNull: false,
    });
  },
};

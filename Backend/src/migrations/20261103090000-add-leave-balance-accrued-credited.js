'use strict';

// leave_balances.accrued_credited — 'monthly' accrual: how much of
// `allotted` the system itself has credited. The monthly job now adds only
// the newly earned credit (new accrual − accrued_credited) on top of
// allotted, so manual corrections / extra days are no longer overwritten.
// Additive only: the column starts NULL and no existing balance is changed.
// A NULL row is treated as "allotted already holds everything credited up to
// now" the first time the job (or a joining-date edit) touches it — see
// leaveBalance.service.js::creditedBaseline.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('leave_balances');
    if (!table.accrued_credited) {
      await queryInterface.addColumn('leave_balances', 'accrued_credited', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_balances', 'accrued_credited');
  },
};

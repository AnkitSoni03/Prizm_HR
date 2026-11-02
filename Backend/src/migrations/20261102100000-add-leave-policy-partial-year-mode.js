'use strict';

// leave_policies.partial_year_mode — 'yearly' accrual only: how much an
// employee gets when their leave period starts mid-year (joining, roster
// assigned / auto-switched after probation):
//   'months_remaining'            — quota × months left ÷ 12, nearest 0.5;
//   'full'                       — the complete quota straight away.
// Required when a Yearly policy is created or edited. NULL = not chosen yet
// (existing policies): calculated like 'months_remaining' until an admin
// picks one — the form makes them choose on the next edit.
// Additive only: no existing balance is touched (rows already created keep
// their allotted amount). See utils/leavePeriod.js::prorateYearlyQuota.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('leave_policies');
    if (!table.partial_year_mode) {
      await queryInterface.addColumn('leave_policies', 'partial_year_mode', {
        type: Sequelize.STRING(20),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_policies', 'partial_year_mode');
  },
};

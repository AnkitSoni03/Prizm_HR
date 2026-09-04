'use strict';

// Backs the auto-generated "Week Off Leaves" leave type (see
// weekOffLeave.service.js) — a Roster Group whose single linked Shift has no
// weekly-off day configured at all gets one of these auto-provisioned, so
// its employees still get a use-it-or-lose-it monthly leave allowance worth
// that month's Sunday count instead of a real designated day off.
// is_week_off_bucket marks the row as system-generated (excluded from the
// normal "Add Leave Type" catalog pickers), same precedent as
// is_carry_forward_bucket.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leave_types', 'is_week_off_bucket', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_types', 'is_week_off_bucket');
  },
};

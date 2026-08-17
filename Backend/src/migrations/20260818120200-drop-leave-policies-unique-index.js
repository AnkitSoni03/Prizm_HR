'use strict';

// Correction to the previous migration: a plain unique index on
// (company_id, leave_type_id) is now WRONG — it would allow only one
// LeavePolicy row per leave type per company, ever, which breaks the whole
// point of Roster-scoped overrides (e.g. a 20-day "Kolkata" row coexisting
// with a 12-day company-wide default row for the same leave type). The real
// constraint — "at most one policy per leave type per Roster Group" — is
// already enforced by roster_group_leave_policies' own unique index on
// (roster_group_id, leave_type_id). "At most one company-wide default per
// leave type" (zero Roster links) is enforced at the application layer in
// leavePolicy.service.js::createLeavePolicy instead, the same way this
// codebase treats plenty of other cross-row invariants that can't be
// expressed as a single-table constraint.
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeIndex('leave_policies', 'leave_policies_company_id_leave_type_id_unique');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addIndex('leave_policies', ['company_id', 'leave_type_id'], {
      unique: true,
      name: 'leave_policies_company_id_leave_type_id_unique',
    });
  },
};

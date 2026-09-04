'use strict';

// Distinguishes HOW a leave request reached its final approved/rejected
// state, for transparent display (ESS dashboard / Team Approvals):
// 'manager_consensus' — every one of the employee's managers approved it
// (see leave_request_approvals, all rows 'approved'); 'admin_override' — a
// company/brand-wide admin approved/rejected it directly, bypassing
// whichever managers hadn't decided yet (their rows are marked 'bypassed',
// never silently left looking 'pending' or falsely marked 'approved').
// Null for a request that was cancelled while still pending, or predates
// this feature.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leave_requests', 'decision_mode', {
      type: Sequelize.ENUM('manager_consensus', 'admin_override'),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_requests', 'decision_mode');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_leave_requests_decision_mode";');
  },
};

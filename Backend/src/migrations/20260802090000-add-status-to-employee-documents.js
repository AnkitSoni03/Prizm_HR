'use strict';

// Replaces the plain `verified` boolean with a real lifecycle status
// (matching this codebase's leave_requests/od_requests/payroll_runs
// convention) so a document can also be explicitly `rejected` — not just
// "not yet verified" — with a reason recorded, per the new admin-side
// reject flow. `verified_by`/`verified_at` are kept as-is and reused as the
// generic "who last decided, when" columns for either outcome (same reused-
// actor-column precedent as leave_requests.approver_id).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employee_documents', 'status', {
      type: Sequelize.ENUM('pending', 'verified', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
    });
    await queryInterface.addColumn('employee_documents', 'rejection_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.sequelize.query(
      `UPDATE employee_documents SET status = 'verified' WHERE verified = true;`
    );

    await queryInterface.removeColumn('employee_documents', 'verified');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('employee_documents', 'verified', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.sequelize.query(
      `UPDATE employee_documents SET verified = true WHERE status = 'verified';`
    );
    await queryInterface.removeColumn('employee_documents', 'rejection_reason');
    await queryInterface.removeColumn('employee_documents', 'status');
  },
};

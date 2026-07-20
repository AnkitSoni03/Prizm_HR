'use strict';

// Adds, to each of the four approve/reject-decision tables:
//   - approver_user_id: the real, always-present User behind a decision.
//     The pre-existing approver_id (Employee FK) on these tables is null
//     for a Company/Brand/Group Admin who has no Employee record of their
//     own — losing "who decided this" entirely for that (common) case. This
//     column is populated from req.auth.userId, which every authenticated
//     request has, so it's a reliable identity even without an Employee link.
//   - rejection_reason: mandatory (enforced at the service layer) free-text
//     reason recorded when a request is rejected.
const TABLES = ['leave_requests', 'od_requests', 'attendance_regularizations', 'comp_off_credits'];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of TABLES) {
      await queryInterface.addColumn(table, 'approver_user_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
      await queryInterface.addColumn(table, 'rejection_reason', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    for (const table of TABLES) {
      await queryInterface.removeColumn(table, 'rejection_reason');
      await queryInterface.removeColumn(table, 'approver_user_id');
    }
  },
};

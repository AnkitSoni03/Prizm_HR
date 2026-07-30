'use strict';

// Tracks who verified a document (and when) — same audit shape as
// company_policies.created_by/updated_by. `verified` (boolean) stays the
// source of truth for gating; these are purely informational.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employee_documents', 'verified_by', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('employee_documents', 'verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employee_documents', 'verified_by');
    await queryInterface.removeColumn('employee_documents', 'verified_at');
  },
};

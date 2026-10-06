'use strict';

// Same as 20261006100000 (leave), for OD requests: an admin can revert an
// already-approved OD request (odRequest.service.js::revokeOdRequest), which
// ends up 'revoked' with who/why/when on the row. The 'revoked' approval-
// history action already exists from 20261006100000.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_od_requests_status" ADD VALUE IF NOT EXISTS 'revoked';`
    );
    await queryInterface.addColumn('od_requests', 'revoked_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('od_requests', 'revoked_by_user_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('od_requests', 'revoke_reason', { type: Sequelize.TEXT, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('od_requests', 'revoke_reason');
    await queryInterface.removeColumn('od_requests', 'revoked_by_user_id');
    await queryInterface.removeColumn('od_requests', 'revoked_at');
    // Enum values can't be dropped in Postgres — same as 20260805090100.
  },
};

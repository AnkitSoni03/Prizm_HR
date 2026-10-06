'use strict';

// Same as 20261006100000 (leave) / 20261006110000 (OD), for comp-off
// credits: an admin can revert an approved, still-unused credit
// (compOff.service.js::revokeCompOffCredit), which ends up 'revoked' with
// who/why/when on the row. The 'revoked' approval-history action already
// exists from 20261006100000.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_comp_off_credits_status" ADD VALUE IF NOT EXISTS 'revoked';`
    );
    await queryInterface.addColumn('comp_off_credits', 'revoked_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('comp_off_credits', 'revoked_by_user_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('comp_off_credits', 'revoke_reason', { type: Sequelize.TEXT, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('comp_off_credits', 'revoke_reason');
    await queryInterface.removeColumn('comp_off_credits', 'revoked_by_user_id');
    await queryInterface.removeColumn('comp_off_credits', 'revoked_at');
    // Enum values can't be dropped in Postgres — same as 20260805090100.
  },
};

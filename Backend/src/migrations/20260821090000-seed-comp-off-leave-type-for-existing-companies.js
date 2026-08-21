'use strict';

// Companion to 20260712090200/20260806090000: backfills the 'CO' (Comp Off)
// leave type added to company.service.js::DEFAULT_LEAVE_TYPES onto every
// company that already existed before this addition. Without a 'CO' leave
// type, leaveRequest.service.js's comp-off consumption path (code === 'CO')
// has nothing to apply against — an employee with an approved comp-off
// credit could earn it but never redeem it.
//
// leave_types.code is uniquely indexed as a PARTIAL index
// (WHERE deleted_at IS NULL, since 20260818150000) — the ON CONFLICT target
// below must repeat that predicate to match the arbiter index.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `
      INSERT INTO leave_types (company_id, code, name, is_paid, carry_forward, created_at, updated_at)
      SELECT c.id, :code, :name, true, false, NOW(), NOW()
      FROM companies c
      WHERE c.deleted_at IS NULL
      ON CONFLICT (company_id, code) WHERE deleted_at IS NULL DO NOTHING;
      `,
      { replacements: { code: 'CO', name: 'Comp Off' }, type: Sequelize.QueryTypes.INSERT }
    );
  },

  // Not reversed — same reasoning as 20260712090200/20260806090000's down():
  // leave_requests/comp_off_credits may already reference this row by the
  // time a rollback would run.
  async down() {},
};

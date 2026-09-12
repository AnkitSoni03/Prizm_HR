'use strict';

// Companion to 20260712090200/20260806090000/20260821090000 — those backfills
// each ran exactly once, so a company created in the narrow window between a
// migration being applied and a running server actually picking up the
// matching company.service.js::DEFAULT_LEAVE_TYPES code change never got
// backfilled OR auto-seeded (confirmed live: company 137 "SSCI", created
// 2026-08-31 — after the 20260821090000 migration had already run — was
// missing UNPAID, UNPAID_HALF, AND CO entirely, which is exactly why its
// employees could earn comp-off credits but MyCompOffPage.tsx showed
// "Comp-off isn't configured as a leave type for your company yet." and
// disabled the redeem button). Re-running the full backfill for every
// DEFAULT_LEAVE_TYPES code (not just the one that was reported missing) is
// the safe, idempotent way to close this gap for any company stuck in the
// same state, known or not — ON CONFLICT DO NOTHING makes this a no-op for
// every company that already has all of them.
//
// leave_types.code is uniquely indexed as a PARTIAL index
// (WHERE deleted_at IS NULL, since 20260818150000) — the ON CONFLICT target
// below must repeat that predicate to match the arbiter index.
const DEFAULT_LEAVE_TYPES = [
  { code: 'ANNUAL', name: 'Annual Leave', isPaid: true },
  { code: 'SHORT', name: 'Short Leave', isPaid: true },
  { code: 'SPECIAL', name: 'Special Leave', isPaid: true },
  { code: 'MATERNITY', name: 'Maternity Leave', isPaid: true },
  { code: 'PATERNITY', name: 'Paternity Leave', isPaid: true },
  { code: 'UNPAID', name: 'Unpaid Leave', isPaid: false },
  { code: 'UNPAID_HALF', name: 'Unpaid Half Day', isPaid: false },
  { code: 'CO', name: 'Comp Off', isPaid: true },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const leaveType of DEFAULT_LEAVE_TYPES) {
      await queryInterface.sequelize.query(
        `
        INSERT INTO leave_types (company_id, code, name, is_paid, carry_forward, created_at, updated_at)
        SELECT c.id, :code, :name, :isPaid, false, NOW(), NOW()
        FROM companies c
        WHERE c.deleted_at IS NULL
        ON CONFLICT (company_id, code) WHERE deleted_at IS NULL DO NOTHING;
        `,
        {
          replacements: { code: leaveType.code, name: leaveType.name, isPaid: leaveType.isPaid },
          type: Sequelize.QueryTypes.INSERT,
        }
      );
    }
  },

  // Not reversed — same reasoning as the three prior backfills: leave_requests/
  // comp_off_credits/leave_balances may already reference these rows by the
  // time a rollback would run.
  async down() {},
};

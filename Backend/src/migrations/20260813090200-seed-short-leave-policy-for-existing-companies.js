'use strict';

// Backfills a Short Leave policy (2/month, accrual='monthly_reset', no
// waiting period) onto every existing company's SHORT leave type, mirroring
// company.service.js::createCompany which now creates this policy for every
// *new* company. Short Leave was previously just a bare LeaveType with no
// policy attached — meant every company had to manually configure it before
// any employee could actually use it. This makes it automatic for everyone,
// same "backfill for pre-existing companies" pattern as
// 20260712090200-seed-default-leave-types-for-existing-companies.js.
// Must run after 20260813090100 (adds the 'monthly_reset' enum value).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO leave_policies (company_id, leave_type_id, annual_quota, accrual, applicable_after_days, created_at, updated_at)
      SELECT lt.company_id, lt.id, 2, 'monthly_reset', 0, NOW(), NOW()
      FROM leave_types lt
      WHERE lt.code = 'SHORT' AND lt.deleted_at IS NULL
      ON CONFLICT (company_id, leave_type_id) DO NOTHING;
    `);
  },

  // Not reversed — same reasoning as 20260712090200's down(): leave_balances
  // may already reference these policy rows by the time a rollback would run.
  async down() {},
};

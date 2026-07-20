'use strict';

// Backfills the 5 named leave types (see company.service.js::createCompany,
// which now creates these for every *new* company) onto every company that
// already existed before this feature — so HR has something to assign a
// Leave Balance against immediately instead of hand-creating them first.
// ON CONFLICT DO NOTHING against the existing (company_id, code) unique
// index makes this safe to run against a company that already created its
// own leave type using one of these codes.
const DEFAULT_LEAVE_TYPES = [
  ['ANNUAL', 'Annual Leave'],
  ['SHORT', 'Short Leave'],
  ['SPECIAL', 'Special Leave'],
  ['MATERNITY', 'Maternity Leave'],
  ['PATERNITY', 'Paternity Leave'],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const valuesSql = DEFAULT_LEAVE_TYPES.map(
      (_, i) => `(:code${i}, :name${i})`
    ).join(', ');
    const replacements = {};
    DEFAULT_LEAVE_TYPES.forEach(([code, name], i) => {
      replacements[`code${i}`] = code;
      replacements[`name${i}`] = name;
    });

    await queryInterface.sequelize.query(
      `
      INSERT INTO leave_types (company_id, code, name, is_paid, carry_forward, created_at, updated_at)
      SELECT c.id, t.code, t.name, true, false, NOW(), NOW()
      FROM companies c
      CROSS JOIN (VALUES ${valuesSql}) AS t(code, name)
      WHERE c.deleted_at IS NULL
      ON CONFLICT (company_id, code) DO NOTHING;
      `,
      { replacements, type: Sequelize.QueryTypes.INSERT }
    );
  },

  // Not reversed: by the time this would be rolled back, employees may
  // already have leave_balances/leave_requests pointing at these rows, and
  // a company could have started actively using them — safer to leave the
  // backfilled types in place than to guess which rows are still "just the
  // seed" versus already in use.
  async down() {},
};

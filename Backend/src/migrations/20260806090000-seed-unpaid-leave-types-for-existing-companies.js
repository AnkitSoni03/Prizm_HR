'use strict';

// Companion to 20260712090200: backfills the 2 unpaid leave types added to
// company.service.js::DEFAULT_LEAVE_TYPES (Unpaid Leave, Unpaid Half Day)
// onto every company that already existed before this addition. Same
// ON CONFLICT DO NOTHING safety against a company that already created its
// own leave type using one of these codes.
const NEW_LEAVE_TYPES = [
  ['UNPAID', 'Unpaid Leave'],
  ['UNPAID_HALF', 'Unpaid Half Day'],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const valuesSql = NEW_LEAVE_TYPES.map((_, i) => `(:code${i}, :name${i})`).join(', ');
    const replacements = {};
    NEW_LEAVE_TYPES.forEach(([code, name], i) => {
      replacements[`code${i}`] = code;
      replacements[`name${i}`] = name;
    });

    await queryInterface.sequelize.query(
      `
      INSERT INTO leave_types (company_id, code, name, is_paid, carry_forward, created_at, updated_at)
      SELECT c.id, t.code, t.name, false, false, NOW(), NOW()
      FROM companies c
      CROSS JOIN (VALUES ${valuesSql}) AS t(code, name)
      WHERE c.deleted_at IS NULL
      ON CONFLICT (company_id, code) DO NOTHING;
      `,
      { replacements, type: Sequelize.QueryTypes.INSERT }
    );
  },

  // Not reversed — same reasoning as 20260712090200's down(): leave_balances/
  // leave_requests may already reference these rows by the time a rollback
  // would run.
  async down() {},
};

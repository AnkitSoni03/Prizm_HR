'use strict';

// Explicit ask: Brand Admin should hold every permission Company Admin holds
// — full literal parity, not a curated subset. Computed as the diff of
// Company Admin's current grant set minus Brand Admin's current grant set
// (106 vs 59 codes) rather than a hand-picked list, so nothing is missed and
// nothing already granted is duplicated (bulkInsert below still
// ignoreDuplicates as a second layer of safety).
//
// Note on scope, called out explicitly to the user before this was written:
// several of these modules (Payroll runs/adjustments/salary structures,
// user account admin, role management) have no brand_id column anywhere and
// were previously Company-Admin-only by deliberate design (see CLAUDE.md's
// Phase-5 Payroll entry — "Brand Admin/Group Admin get nothing beyond
// [payslip:read_own] ... per explicit requirement"). Granting these codes
// gives Brand Admin the same company-wide reach Company Admin has over them
// (e.g. can process payroll for the whole company, not just their own
// brand) — accepted as intended by explicit instruction, not an oversight.
const ROLE_NAME = 'Brand Admin';
const CODES = [
  'comp_off:credit',
  'company:read',
  'company:update',
  'employee_document:upload',
  'employee_document:verify',
  'employee_shift:create',
  'employee_shift:delete',
  'invitation:create',
  'invitation:read',
  'invitation:revoke',
  'leave_balance:adjust',
  'leave_balance:read',
  'leave_policy:create',
  'leave_policy:read',
  'leave_policy:update',
  'leave_type:create',
  'leave_type:delete',
  'leave_type:update',
  'payroll_adjustment:create',
  'payroll_adjustment:delete',
  'payroll_adjustment:read',
  'payroll_adjustment:update',
  'payroll_run:cancel',
  'payroll_run:create',
  'payroll_run:pay',
  'payroll_run:process',
  'payroll_run:read',
  'payroll_settings:read',
  'payroll_settings:update',
  'payslip:read',
  'permission:read',
  'plan:read',
  'role:assign',
  'role:create',
  'role:delete',
  'role:read',
  'role:update',
  'salary_component:create',
  'salary_component:delete',
  'salary_component:read',
  'salary_component:update',
  'salary_structure:create',
  'salary_structure:read',
  'salary_structure:update',
  'session:revoke',
  'user:activate',
  'user:disable',
  'user:reset_password',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const [role] = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name = :name',
      { replacements: { name: ROLE_NAME }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) throw new Error(`Seed order error: role "${ROLE_NAME}" not found.`);

    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: CODES }, type: Sequelize.QueryTypes.SELECT }
    );
    if (permissions.length !== CODES.length) {
      const found = new Set(permissions.map((p) => p.code));
      const missing = CODES.filter((c) => !found.has(c));
      throw new Error(`Seed order error: permission code(s) not found: ${missing.join(', ')}`);
    }

    await queryInterface.bulkInsert(
      'role_permissions',
      permissions.map((p) => ({ role_id: role.id, permission_id: p.id, created_at: now, updated_at: now })),
      { ignoreDuplicates: true }
    );
  },

  async down(queryInterface, Sequelize) {
    const [role] = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name = :name',
      { replacements: { name: ROLE_NAME }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) return;

    const permissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: CODES }, type: Sequelize.QueryTypes.SELECT }
    );

    await queryInterface.bulkDelete('role_permissions', {
      role_id: role.id,
      permission_id: permissions.map((p) => p.id),
    });
  },
};

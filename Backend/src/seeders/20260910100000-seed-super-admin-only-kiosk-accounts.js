'use strict';

// Kiosk (Scanner) account provisioning moves to Super Admin only, and a
// kiosk account becomes a GROUP-level machine account with one or more
// physical locations instead of a company/brand-scoped one.
//
// Two things happen here:
//
// 1. `scanner_account:create` is revoked from Company Admin, HR Manager and
//    Brand Admin. The route itself no longer checks a permission code at
//    all — it's gated structurally by requireSuperAdmin (same reasoning as
//    auth.service.js's signup-invite gate: a Company Admin can legitimately
//    hold broad codes for their own company without that ever reaching a
//    cross-tenant action). The revoke is belt-and-braces so the code can't
//    be silently re-honoured if the route is ever re-gated on it, and so
//    `GET /auth/me` stops advertising a capability those portals no longer
//    have. role_permissions rows are HARD-deleted (`paranoid: true` on that
//    table is never actually exercised anywhere in the app) — the same
//    reason employee.service.js::assignEmployeePowers hard-deletes them: a
//    soft-deleted row keeps occupying the (role_id, permission_id)
//    composite PK and would silently no-op any future re-grant.
//    The `permissions` row itself is left in place, dormant.
//
// 2. Every pre-existing Scanner account is deleted. They were created by
//    Company/Brand Admins and are company/brand-scoped with no locations —
//    the new flow has no code path for that shape, so leaving them would
//    leave accounts that can authenticate but can never claim a location.
//    Explicitly requested: kiosks get re-provisioned by Super Admin at
//    group level. Their attendance rows are untouched (attendance.kiosk_user_id
//    is ON DELETE SET NULL).
const REVOKE_FROM_ROLES = ['Company Admin', 'HR Manager', 'Brand Admin'];
const CODE = 'scanner_account:create';

module.exports = {
  async up(queryInterface, Sequelize) {
    const { QueryTypes } = Sequelize;

    await queryInterface.sequelize.query(
      `DELETE FROM role_permissions rp
         USING roles r, permissions p
        WHERE rp.role_id = r.id
          AND rp.permission_id = p.id
          AND p.code = :code
          AND r.is_system = true
          AND r.name IN (:names)`,
      { replacements: { code: CODE, names: REVOKE_FROM_ROLES } }
    );

    const scannerUsers = await queryInterface.sequelize.query(
      `SELECT DISTINCT ur.user_id AS id
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
        WHERE r.is_system = true AND r.name = 'Scanner'`,
      { type: QueryTypes.SELECT }
    );
    const userIds = scannerUsers.map((row) => row.id);
    if (userIds.length === 0) return;

    // Order matters: the grants reference the users. Both hard-deleted —
    // a soft-deleted User row would keep holding its (company_id, email)
    // uniqueness slot, blocking a Super Admin from re-creating a kiosk
    // under the same address.
    await queryInterface.sequelize.query('DELETE FROM user_roles WHERE user_id IN (:userIds)', {
      replacements: { userIds },
    });
    await queryInterface.sequelize.query('DELETE FROM users WHERE id IN (:userIds)', {
      replacements: { userIds },
    });
  },

  // Deliberately not reversible: the revoked grants can be restored, but the
  // deleted kiosk accounts (and their bcrypt hashes) cannot be reconstructed.
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
       SELECT r.id, p.id, NOW(), NOW()
         FROM roles r, permissions p
        WHERE p.code = :code AND r.is_system = true AND r.name IN (:names)
       ON CONFLICT DO NOTHING`,
      { replacements: { code: CODE, names: REVOKE_FROM_ROLES } }
    );
  },
};

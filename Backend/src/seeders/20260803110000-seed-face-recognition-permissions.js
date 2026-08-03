'use strict';

// Face recognition replaces the QR+WebAuthn kiosk flow. Every Employee can
// register/read their own face profile; the Scanner (kiosk) role gets the
// single permission needed to verify a face and mark attendance. The old
// kiosk_token/kiosk_video/employee_device/qr_terminal/attendance:mark codes
// are now dead — their routes and frontend consumers are all deleted — so
// this seeder also revokes those grants. The `permissions` rows themselves
// are deliberately left in place (dormant, not deleted), matching this
// codebase's established "don't delete seeded permission rows" convention
// (see employee.service.js::assignEmployeePowers's hard-delete-of-the-JOIN-
// row-only precedent, mirrored below via role_permissions).
const NEW_PERMISSIONS = [
  ['attendance', 'face_profile:register', 'Register or update your own face profile for kiosk attendance'],
  ['attendance', 'face_profile:read_own', 'View your own face profile registration status'],
  ['attendance', 'attendance:face_verify', 'Verify a face and mark attendance, and upload its audit capture (kiosk only)'],
];

const DEAD_CODES = [
  'attendance:kiosk_token',
  'attendance:kiosk_video',
  'employee_device:register',
  'employee_device:revoke',
  'qr_terminal:create',
  'qr_terminal:read',
  'attendance:mark',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert(
      'permissions',
      NEW_PERMISSIONS.map(([module, code, description]) => ({
        module,
        code,
        description,
        created_at: now,
        updated_at: now,
      })),
      { ignoreDuplicates: true }
    );

    const roles = await queryInterface.sequelize.query(
      "SELECT id, name FROM roles WHERE is_system = true AND name IN ('Scanner', 'Employee')",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (roles.length !== 2) {
      const found = new Set(roles.map((r) => r.name));
      const missing = ['Scanner', 'Employee'].filter((n) => !found.has(n));
      throw new Error(`Seed order error: role(s) not found: ${missing.join(', ')}`);
    }
    const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));

    const newCodes = NEW_PERMISSIONS.map(([, code]) => code);
    const newPermissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: newCodes }, type: Sequelize.QueryTypes.SELECT }
    );
    if (newPermissions.length !== newCodes.length) {
      const found = new Set(newPermissions.map((p) => p.code));
      const missing = newCodes.filter((code) => !found.has(code));
      throw new Error(`Seed order error: permission(s) not found: ${missing.join(', ')}`);
    }
    const permIdByCode = new Map(newPermissions.map((p) => [p.code, p.id]));

    await queryInterface.bulkInsert(
      'role_permissions',
      [
        { role_id: roleIdByName.get('Scanner'), permission_id: permIdByCode.get('attendance:face_verify'), created_at: now, updated_at: now },
        { role_id: roleIdByName.get('Employee'), permission_id: permIdByCode.get('face_profile:register'), created_at: now, updated_at: now },
        { role_id: roleIdByName.get('Employee'), permission_id: permIdByCode.get('face_profile:read_own'), created_at: now, updated_at: now },
      ],
      { ignoreDuplicates: true }
    );

    // Revoke the now-dead grants — a real DELETE (not a soft-delete-through-
    // the-model), same reasoning as assignEmployeePowers's RolePermission
    // hard-delete: a dead row left behind on the (role_id, permission_id)
    // composite would silently block a future re-grant of the same code.
    const deadPermissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: DEAD_CODES }, type: Sequelize.QueryTypes.SELECT }
    );
    const deadIds = deadPermissions.map((p) => p.id);
    if (deadIds.length > 0) {
      await queryInterface.bulkDelete('role_permissions', {
        permission_id: { [Sequelize.Op.in]: deadIds },
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const newCodes = NEW_PERMISSIONS.map(([, code]) => code);
    const newPermissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: newCodes }, type: Sequelize.QueryTypes.SELECT }
    );
    const newIds = newPermissions.map((p) => p.id);
    if (newIds.length > 0) {
      await queryInterface.bulkDelete('role_permissions', { permission_id: { [Sequelize.Op.in]: newIds } });
    }
    await queryInterface.bulkDelete('permissions', { code: newCodes });
    // Deliberately not restoring the revoked old grants — their routes no
    // longer exist either way, so there'd be nothing for them to authorize.
  },
};

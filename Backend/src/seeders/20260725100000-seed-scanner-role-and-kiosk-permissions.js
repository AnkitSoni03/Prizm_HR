'use strict';

// New system role for the office kiosk flow: a physical kiosk device logs
// in as a dedicated 'Scanner' User account (JWT-based, like any other role)
// rather than authenticating via the old qr_attendance_terminals
// secretKey/X-Terminal-Secret mechanism, which is left in place but dormant.
// A Scanner account only needs to issue office tokens and drive the SSE
// video-trigger/upload endpoints — nothing else.
const ROLE_NAME = 'Scanner';
const ROLE_DESCRIPTION = 'Physical attendance kiosk device account: issues office QR tokens and records check-in/out video';

const KIOSK_PERMISSIONS = [
  ['attendance', 'attendance:kiosk_token', 'Issue a rotating office QR token (kiosk only)'],
  ['attendance', 'attendance:kiosk_video', 'Open the kiosk video-trigger stream and upload check-in/out video'],
];

// Provisioning a kiosk account is an admin action, not something a kiosk
// does for itself — scoped the same way employee:create already is (Brand
// Admin's grant only reaches their own brand via the existing brandId
// scoping in rbac.middleware.js's userHasPermission).
const CREATE_PERMISSION = ['attendance', 'scanner_account:create', 'Create a Scanner (kiosk) account'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert(
      'permissions',
      [...KIOSK_PERMISSIONS, CREATE_PERMISSION].map(([module, code, description]) => ({
        module,
        code,
        description,
        created_at: now,
        updated_at: now,
      })),
      { ignoreDuplicates: true }
    );

    await queryInterface.bulkInsert(
      'roles',
      [
        {
          company_id: null,
          name: ROLE_NAME,
          is_system: true,
          description: ROLE_DESCRIPTION,
          created_at: now,
          updated_at: now,
        },
      ],
      { ignoreDuplicates: true }
    );

    const [scannerRole] = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name = :name',
      { replacements: { name: ROLE_NAME }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!scannerRole) throw new Error(`Seed order error: role "${ROLE_NAME}" not found after insert.`);

    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      {
        replacements: { names: ['Company Admin', 'HR Manager', 'Brand Admin'] },
        type: Sequelize.QueryTypes.SELECT,
      }
    );
    if (roles.length !== 3) {
      const found = new Set(roles.map((r) => r.name));
      const missing = ['Company Admin', 'HR Manager', 'Brand Admin'].filter((n) => !found.has(n));
      throw new Error(`Seed order error: role(s) not found: ${missing.join(', ')}`);
    }

    const allCodes = [...KIOSK_PERMISSIONS, CREATE_PERMISSION].map(([, code]) => code);
    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: allCodes }, type: Sequelize.QueryTypes.SELECT }
    );
    if (permissions.length !== allCodes.length) {
      const found = new Set(permissions.map((p) => p.code));
      const missing = allCodes.filter((code) => !found.has(code));
      throw new Error(`Seed order error: permission(s) not found: ${missing.join(', ')}`);
    }
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

    const rows = [];
    for (const [, code] of KIOSK_PERMISSIONS) {
      rows.push({ role_id: scannerRole.id, permission_id: permIdByCode.get(code), created_at: now, updated_at: now });
    }
    for (const role of roles) {
      rows.push({
        role_id: role.id,
        permission_id: permIdByCode.get(CREATE_PERMISSION[1]),
        created_at: now,
        updated_at: now,
      });
    }

    await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', {
      code: [...KIOSK_PERMISSIONS, CREATE_PERMISSION].map(([, code]) => code),
    });
    await queryInterface.bulkDelete('roles', { name: ROLE_NAME, is_system: true, company_id: null });
  },
};

'use strict';

// Same gap as 20260707150800: the original attendance permission batch
// covers request/approve/reject for regularizations and OD requests, but
// missed a plain "view a list" permission for either — added here rather
// than editing the already-applied seeder file.
const PERMISSIONS = [
  ['attendance', 'attendance_regularization:read', 'View regularization requests for others'],
  ['attendance', 'attendance_regularization:read_own', 'View own regularization requests'],
  ['attendance', 'od_request:read', "View any employee's OD requests"],
  ['attendance', 'od_request:read_own', 'View own OD requests'],
];

const ROLE_GRANTS = {
  'Company Admin': ['attendance_regularization:read', 'od_request:read'],
  'Brand Admin': ['attendance_regularization:read', 'od_request:read'],
  'HR Manager': ['attendance_regularization:read', 'od_request:read'],
  'Group Admin': ['attendance_regularization:read', 'od_request:read'],
  Employee: ['attendance_regularization:read_own', 'od_request:read_own'],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    await queryInterface.bulkInsert(
      'permissions',
      PERMISSIONS.map(([module, code, description]) => ({
        module,
        code,
        description,
        created_at: now,
        updated_at: now,
      })),
      { ignoreDuplicates: true }
    );

    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: Object.keys(ROLE_GRANTS) }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: PERMISSIONS.map(([, code]) => code) }, type: Sequelize.QueryTypes.SELECT }
    );

    const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

    const rows = [];
    for (const [roleName, codes] of Object.entries(ROLE_GRANTS)) {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) throw new Error(`Seed order error: role "${roleName}" not found.`);

      for (const code of codes) {
        const permissionId = permIdByCode.get(code);
        if (!permissionId) throw new Error(`Seed order error: permission "${code}" not found.`);
        rows.push({ role_id: roleId, permission_id: permissionId, created_at: now, updated_at: now });
      }
    }

    await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', {
      code: PERMISSIONS.map(([, code]) => code),
    });
  },
};

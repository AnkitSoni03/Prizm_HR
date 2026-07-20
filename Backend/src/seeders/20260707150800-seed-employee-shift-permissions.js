'use strict';

// The original attendance permission batch (20260707130000-seed-permissions.js)
// covers shift/shift_roster/attendance/etc. but missed employee_shifts (the
// default per-employee shift assignment table) — added here as a follow-up
// batch rather than editing the already-applied seeder file.
const PERMISSIONS = [
  ['attendance', 'employee_shift:create', "Assign an Employee's default shift"],
  ['attendance', 'employee_shift:read', "View any Employee's default shift assignments"],
  ['attendance', 'employee_shift:read_own', "View the caller's own default shift assignments"],
  ['attendance', 'employee_shift:delete', 'Remove a default shift assignment'],
];

const ROLE_GRANTS = {
  'Company Admin': ['employee_shift:create', 'employee_shift:read', 'employee_shift:delete'],
  'Brand Admin': ['employee_shift:read'],
  'HR Manager': ['employee_shift:create', 'employee_shift:read', 'employee_shift:delete'],
  'Group Admin': ['employee_shift:read'],
  Employee: ['employee_shift:read_own'],
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

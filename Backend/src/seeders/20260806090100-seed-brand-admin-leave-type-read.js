'use strict';

// Brand Admin reuses Company Admin's AttendanceRecordsPage.tsx, whose
// status filter / bulk "Change Status" dropdown now lists the company's
// actual leave types by name (fetched via GET /leave/types) alongside
// Present/Absent/Half Day — Brand Admin never held leave_type:read before
// (Company Admin/HR Manager both already do), so that call 403'd for them.
const ROLE_GRANTS = {
  'Brand Admin': ['leave_type:read'],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const roleNames = Object.keys(ROLE_GRANTS);
    const codes = [...new Set(Object.values(ROLE_GRANTS).flat())];

    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: roleNames }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes }, type: Sequelize.QueryTypes.SELECT }
    );

    const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

    const rows = [];
    for (const [roleName, roleCodes] of Object.entries(ROLE_GRANTS)) {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) throw new Error(`Seed order error: role "${roleName}" not found.`);
      for (const code of roleCodes) {
        const permissionId = permIdByCode.get(code);
        if (!permissionId) throw new Error(`Seed order error: permission "${code}" not found.`);
        rows.push({ role_id: roleId, permission_id: permissionId, created_at: now, updated_at: now });
      }
    }

    await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    const roleNames = Object.keys(ROLE_GRANTS);
    const codes = [...new Set(Object.values(ROLE_GRANTS).flat())];

    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: roleNames }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes }, type: Sequelize.QueryTypes.SELECT }
    );

    const roleIds = roles.map((r) => r.id);
    const permissionIds = permissions.map((p) => p.id);
    if (roleIds.length === 0 || permissionIds.length === 0) return;

    await queryInterface.bulkDelete('role_permissions', { role_id: roleIds, permission_id: permissionIds });
  },
};

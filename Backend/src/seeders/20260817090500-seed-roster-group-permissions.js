'use strict';

// Roster Group has no brand_id column (company-level entity, same tier as
// Department/Designation/Shift) — Company Admin/HR Manager/Brand Admin all
// get full CRUD, mirroring the final state those three roles ended up at for
// Department/Designation/Shift. Group Admin gets read-only, matching its
// existing read-only company drill-in pattern for other company-wide
// entities (e.g. holiday:read).
const MODULE = 'org';
const PERMISSIONS = [
  ['roster_group:create', 'Create a Roster Group'],
  ['roster_group:read', 'View Roster Groups'],
  ['roster_group:update', 'Update a Roster Group (including bulk-assigning employees)'],
  ['roster_group:delete', 'Delete a Roster Group'],
];
const ROLE_GRANTS = {
  'Company Admin': ['roster_group:create', 'roster_group:read', 'roster_group:update', 'roster_group:delete'],
  'HR Manager': ['roster_group:create', 'roster_group:read', 'roster_group:update', 'roster_group:delete'],
  'Brand Admin': ['roster_group:create', 'roster_group:read', 'roster_group:update', 'roster_group:delete'],
  'Group Admin': ['roster_group:read'],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    await queryInterface.bulkInsert(
      'permissions',
      PERMISSIONS.map(([code, description]) => ({ module: MODULE, code, description, created_at: now, updated_at: now })),
      { ignoreDuplicates: true }
    );

    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: Object.keys(ROLE_GRANTS) }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: PERMISSIONS.map(([code]) => code) }, type: Sequelize.QueryTypes.SELECT }
    );

    const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

    const rows = [];
    for (const [roleName, roleCodes] of Object.entries(ROLE_GRANTS)) {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) throw new Error(`Seed order error: role "${roleName}" not found.`);
      for (const roleCode of roleCodes) {
        const permissionId = permIdByCode.get(roleCode);
        if (!permissionId) throw new Error(`Seed order error: permission "${roleCode}" not found.`);
        rows.push({ role_id: roleId, permission_id: permissionId, created_at: now, updated_at: now });
      }
    }

    await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    const codes = PERMISSIONS.map(([code]) => code);
    const roles = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: Object.keys(ROLE_GRANTS) }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes }, type: Sequelize.QueryTypes.SELECT }
    );
    if (roles.length > 0 && permissions.length > 0) {
      await queryInterface.bulkDelete('role_permissions', {
        role_id: roles.map((r) => r.id),
        permission_id: permissions.map((p) => p.id),
      });
    }
    await queryInterface.bulkDelete('permissions', { code: codes });
  },
};

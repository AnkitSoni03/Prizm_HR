'use strict';

// Comp-Off Policy has no brand_id column (company-level entity, same tier as
// Department/Designation/Shift/RosterGroup) — Company Admin/HR Manager/Brand
// Admin all get full CRUD + assign, mirroring the precedent already
// established for Roster Group (20260817090500). Group Admin gets read-only,
// matching its existing read-only company drill-in pattern (e.g.
// comp_off:read for the credits themselves).
const MODULE = 'leave';
const PERMISSIONS = [
  ['comp_off_policy:create', 'Create a Comp-Off Policy'],
  ['comp_off_policy:read', 'View Comp-Off Policies'],
  ['comp_off_policy:update', 'Update a Comp-Off Policy'],
  ['comp_off_policy:delete', 'Delete a Comp-Off Policy'],
  ['comp_off_policy:assign', 'Assign employees to a Comp-Off Policy'],
];
const ROLE_GRANTS = {
  'Company Admin': [
    'comp_off_policy:create', 'comp_off_policy:read', 'comp_off_policy:update',
    'comp_off_policy:delete', 'comp_off_policy:assign',
  ],
  'HR Manager': [
    'comp_off_policy:create', 'comp_off_policy:read', 'comp_off_policy:update',
    'comp_off_policy:delete', 'comp_off_policy:assign',
  ],
  'Brand Admin': [
    'comp_off_policy:create', 'comp_off_policy:read', 'comp_off_policy:update',
    'comp_off_policy:delete', 'comp_off_policy:assign',
  ],
  'Group Admin': ['comp_off_policy:read'],
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

'use strict';

// Brand Admin gets the same create/update/delete power Company Admin has for
// Employees, Shifts, Departments, and Designations (Shift Roster and Holiday
// already got this treatment in earlier seeders). Department/Designation/
// Shift have no brand_id column at all — they're company-level entities, so
// granting these codes here naturally gives Brand Admin the same company-wide
// reach Company Admin has over them, no additional scoping needed. Employee
// *does* carry a brand_id, so employee.controller.js/service.js were updated
// alongside this seeder to enforce req.auth.scopedBrandIds on
// create/update/transfer/delete (same shape as the existing
// holiday.service.js/shiftRoster.service.js brand-scoping) — a Brand Admin's
// grant here only ever reaches their own brand's employees.
const ROLE_GRANTS = {
  'Brand Admin': [
    'department:create', 'department:update', 'department:delete',
    'designation:create', 'designation:update', 'designation:delete',
    'employee:create', 'employee:update', 'employee:delete', 'employee:transfer',
    'shift:create', 'shift:update', 'shift:delete',
  ],
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

    await queryInterface.bulkDelete('role_permissions', {
      role_id: roleIds,
      permission_id: permissionIds,
    });
  },
};

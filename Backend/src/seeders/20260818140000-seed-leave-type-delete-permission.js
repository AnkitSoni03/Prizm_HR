'use strict';

// leave_type:delete never existed — Leave Types only ever had Create/Read/
// Update. Granted to the same role that already holds leave_type:create/
// update: Company Admin. (Same known gap as every other additive permission
// seeder in this codebase: Super Admin's original 'ALL' grant was resolved
// once at initial seed time, not re-synced for codes added later — see
// 20260807100000-seed-shift-roster-delete-permission.js for the identical
// precedent.)
const PERMISSION = ['leave', 'leave_type:delete', 'Delete a leave type'];
const ROLE_GRANTS = {
  'Company Admin': ['leave_type:delete'],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const [module, code, description] = PERMISSION;
    await queryInterface.bulkInsert(
      'permissions',
      [{ module, code, description, created_at: now, updated_at: now }],
      { ignoreDuplicates: true }
    );

    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: Object.keys(ROLE_GRANTS) }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code = :code',
      { replacements: { code }, type: Sequelize.QueryTypes.SELECT }
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
    const [, code] = PERMISSION;
    const roles = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: Object.keys(ROLE_GRANTS) }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code = :code',
      { replacements: { code }, type: Sequelize.QueryTypes.SELECT }
    );
    if (roles.length > 0 && permissions.length > 0) {
      await queryInterface.bulkDelete('role_permissions', {
        role_id: roles.map((r) => r.id),
        permission_id: permissions.map((p) => p.id),
      });
    }
    await queryInterface.bulkDelete('permissions', { code });
  },
};

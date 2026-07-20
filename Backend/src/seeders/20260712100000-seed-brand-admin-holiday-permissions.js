'use strict';

// Brand Admin previously held only holiday:read (view). Company Admin/HR
// Team can manage holidays; Brand Admin should be able to manage their own
// Brand's holidays the same way — holiday.controller.js/service.js now
// scope a brand-scoped caller's writes to their own brandId (a Brand
// Admin's holiday:create/update/delete grant is stamped with their brandId
// at invite time, same as their other permissions), so granting these
// codes here doesn't let them touch company-wide or another Brand's
// holidays. No new permission codes needed — both already exist.
const ROLE_GRANTS = {
  'Brand Admin': ['holiday:create', 'holiday:update', 'holiday:delete'],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: Object.keys(ROLE_GRANTS) }, type: Sequelize.QueryTypes.SELECT }
    );
    const codes = [...new Set(Object.values(ROLE_GRANTS).flat())];
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
    const roles = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE is_system = true AND name = 'Brand Admin'",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (roles.length === 0) return;
    const codes = [...new Set(Object.values(ROLE_GRANTS).flat())];
    const permissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes }, type: Sequelize.QueryTypes.SELECT }
    );
    await queryInterface.bulkDelete('role_permissions', {
      role_id: roles[0].id,
      permission_id: permissions.map((p) => p.id),
    });
  },
};

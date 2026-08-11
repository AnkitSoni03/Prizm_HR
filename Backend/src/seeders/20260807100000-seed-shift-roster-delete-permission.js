'use strict';

// shift_roster:delete never existed — the Rosters table only ever had an
// Edit action. Granted to the same roles that already hold
// shift_roster:create/update: Company Admin/HR Manager (company-wide) and
// Brand Admin (their own brand only, via the existing scopedBrandIds
// enforcement shiftRoster.service.js already applies to update).
const PERMISSION = ['attendance', 'shift_roster:delete', 'Delete a roster entry'];
const ROLE_GRANTS = {
  'Company Admin': ['shift_roster:delete'],
  'HR Manager': ['shift_roster:delete'],
  'Brand Admin': ['shift_roster:delete'],
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

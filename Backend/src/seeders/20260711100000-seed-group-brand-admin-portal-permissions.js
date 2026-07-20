'use strict';

// Follow-up grants surfaced while building the Group Admin (/group-admin)
// and Brand Admin (/brand-admin) portals: no new permission codes needed,
// these all already exist in the base seeder — Brand Admin was missing
// shift:read (could approve/reject regularizations without ever seeing the
// Shift definitions behind them) and shift_roster:create/update (dashboard
// says "Rosters (create/edit)" but only shift_roster:read was granted), plus
// comp_off:read for both roles (could approve/reject a comp-off credit it
// couldn't list, same gap shape as 20260709110000's approve/reject-without-
// read for Company Admin/HR Manager before that batch).
const ROLE_GRANTS = {
  'Brand Admin': ['shift:read', 'comp_off:read', 'shift_roster:create', 'shift_roster:update'],
  'Group Admin': ['comp_off:read'],
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

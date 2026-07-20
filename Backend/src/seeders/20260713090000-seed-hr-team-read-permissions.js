'use strict';

// Gap found wiring up "Provide Leaves": HR Team could adjust a leave
// balance but had no way to reach the employee-selection UI at all —
// listing employees (GET /employees), departments and brands (for the
// filter dropdowns) all require employee:read/department:read/brand:read,
// none of which the original HR Team seeder granted. All three are
// read-only — HR Team still can't create/update/delete an employee,
// department, or brand, only see them, matching the "narrower than HR
// Manager" intent from 20260712090000-seed-hr-team-role.js. Added here
// rather than editing that already-applied seeder file, same convention as
// every other follow-up permission batch in this project.
const ROLE_GRANTS = {
  'HR Team': ['employee:read', 'department:read', 'brand:read'],
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
      if (!roleId) throw new Error(`Seed order error: role "${roleName}" not found. Run seed-hr-team-role first.`);

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
      "SELECT id FROM roles WHERE is_system = true AND name = 'HR Team'",
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

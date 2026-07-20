'use strict';

// Company Policy is a brand-new module (title + rich text body + optional
// file URL, company-wide, mirrors the Holiday module's shape). Grant
// distribution deliberately mirrors Holiday's exact asymmetry: `read` is
// broad (everyone who can see the company at all), `create/update/delete`
// only goes to Company Admin + HR Manager by default — Brand Admin and
// individual Employees only get write access via the new per-employee
// "powers" mechanism (see powerCatalog.js's `company_policy` bundle).
const PERMISSIONS = [
  ['org', 'company_policy:create', 'Create a Company Policy'],
  ['org', 'company_policy:read', 'View Company Policies'],
  ['org', 'company_policy:update', 'Update a Company Policy'],
  ['org', 'company_policy:delete', 'Delete a Company Policy'],
];

const ROLE_GRANTS = {
  'Company Admin': ['company_policy:create', 'company_policy:read', 'company_policy:update', 'company_policy:delete'],
  'HR Manager': ['company_policy:create', 'company_policy:read', 'company_policy:update', 'company_policy:delete'],
  'Brand Admin': ['company_policy:read'],
  'Group Admin': ['company_policy:read'],
  Employee: ['company_policy:read'],
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

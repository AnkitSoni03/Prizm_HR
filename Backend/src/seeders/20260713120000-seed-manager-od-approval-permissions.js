'use strict';

// Same shape as 20260713110000's leave_request manager-approval grant: a
// manager is just any Employee referenced by another employee's managerId,
// not a distinct RBAC role. Granted broadly to the Employee role (most
// employees have zero direct reports — the grant is a no-op for them,
// scoped per-request by odRequest.routes.js comparing the target request's
// employee.managerId against the caller's own employeeId). Company Admin/
// Brand Admin/HR Manager already hold plain od_request:approve/reject
// (company/brand-wide), so they're unaffected — this is purely additive.
const PERMISSIONS = [
  ['attendance', 'od_request:read_reports', "View OD requests from the caller's direct reports"],
  ['attendance', 'od_request:approve_reports', "Approve a direct report's OD request"],
  ['attendance', 'od_request:reject_reports', "Reject a direct report's OD request"],
];

const ROLE_GRANTS = {
  Employee: ['od_request:read_reports', 'od_request:approve_reports', 'od_request:reject_reports'],
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

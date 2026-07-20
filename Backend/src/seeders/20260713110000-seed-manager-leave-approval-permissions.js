'use strict';

// A "manager" isn't a distinct RBAC role in this system — it's just any
// Employee referenced by another employee's `managerId` (employee.js's
// self-referencing FK). These codes are granted broadly to the whole
// Employee role (same shape as employee:read_own — most employees have no
// direct reports and the grant is a no-op for them, scoped down at request
// time by comparing the target request's employee.managerId against the
// caller's own employeeId, not by who holds the code). Company Admin/Brand
// Admin/HR Manager already hold plain leave_request:approve/reject
// (company/brand-wide), so they're unaffected — this is purely additive.
const PERMISSIONS = [
  ['leave', 'leave_request:read_reports', "View leave requests from the caller's direct reports"],
  ['leave', 'leave_request:approve_reports', "Approve a direct report's leave request"],
  ['leave', 'leave_request:reject_reports', "Reject a direct report's leave request"],
];

const ROLE_GRANTS = {
  Employee: ['leave_request:read_reports', 'leave_request:approve_reports', 'leave_request:reject_reports'],
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

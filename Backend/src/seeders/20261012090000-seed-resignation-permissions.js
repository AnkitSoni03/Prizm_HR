'use strict';

// Resignations (modules/org/resignation.service.js):
//   - submit_own / read_own: every Employee, for their own resignation.
//   - read: Company Admin / Brand Admin / HR Manager see their company's (or
//     brand's) resignations, view-only, and are notified on submission.
//   - read_reports: a manager sees their reports' resignations, view-only.
//   - decide_assigned: accept/reject — granted to every Employee, but only
//     ever usable on an employee whose employees.hr_employee_id is the
//     caller (checked per resignation, same shape as the *_reports codes).
const PERMISSIONS = [
  ['org', 'resignation:submit_own', 'Submit or withdraw your own resignation'],
  ['org', 'resignation:read_own', 'View your own resignations'],
  ['org', 'resignation:read', 'View resignations in your company/brand'],
  ['org', 'resignation:read_reports', 'View resignations of your reports'],
  ['org', 'resignation:decide_assigned', 'Accept or reject resignations of employees you are the assigned HR for'],
];

const ROLE_GRANTS = {
  Employee: ['resignation:submit_own', 'resignation:read_own', 'resignation:read_reports', 'resignation:decide_assigned'],
  'Company Admin': ['resignation:read'],
  'Brand Admin': ['resignation:read'],
  'HR Manager': ['resignation:read'],
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

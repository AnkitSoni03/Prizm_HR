'use strict';

// Manager-based comp-off approval, same shape as the leave/OD _reports
// grants: a manager is any Employee referenced as another employee's
// primary or additional manager (any company of the Group), not a distinct
// RBAC role. Granted broadly to the Employee role — a no-op for anyone with
// no reports; the real check is per-credit, against that credit's own
// snapshotted comp_off_credit_approvals rows (compOff.routes.js).
const PERMISSIONS = [
  ['leave', 'comp_off:read_reports', "View comp-off credits of the caller's reports"],
  ['leave', 'comp_off:approve_reports', "Approve a report's comp-off credit (one vote among all their managers)"],
  ['leave', 'comp_off:reject_reports', "Reject a report's comp-off credit"],
];

const ROLE_GRANTS = {
  Employee: ['comp_off:read_reports', 'comp_off:approve_reports', 'comp_off:reject_reports'],
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

'use strict';

// Lets Company Admin/HR Manager/Brand Admin directly set (or bulk-set) an
// employee's attendance status for a date — the "employee forgot to mark
// their attendance" admin override, separate from the employee-initiated
// attendance_regularization approve/reject flow (which all three roles
// already hold). Same role set as attendance_regularization:approve/reject.
const NEW_PERMISSIONS = [
  ['attendance', 'attendance:update', "Manually set an employee's attendance status for a date (admin correction)"],
];

const ROLE_GRANTS = {
  'Company Admin': ['attendance:update'],
  'Brand Admin': ['attendance:update'],
  'HR Manager': ['attendance:update'],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert(
      'permissions',
      NEW_PERMISSIONS.map(([module, code, description]) => ({
        module,
        code,
        description,
        created_at: now,
        updated_at: now,
      })),
      { ignoreDuplicates: true }
    );

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
    const codes = NEW_PERMISSIONS.map(([, code]) => code);
    const permissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissionIds = permissions.map((p) => p.id);
    if (permissionIds.length > 0) {
      await queryInterface.bulkDelete('role_permissions', { permission_id: { [Sequelize.Op.in]: permissionIds } });
    }
    await queryInterface.bulkDelete('permissions', { code: codes });
  },
};

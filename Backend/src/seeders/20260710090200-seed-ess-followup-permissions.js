'use strict';

// Gaps found building the ESS portal: Employee never got leave_type:read (the
// apply-leave form needs a leave-type dropdown), and there was no read_own
// variant of comp_off:read at all (employees couldn't see their own
// comp-off credit balance/expiry). Added here rather than editing the
// already-applied seeder files, same as the other follow-up batches.
const NEW_PERMISSIONS = [['leave', 'comp_off:read_own', "View the caller's own comp-off credits"]];

const EXISTING_PERMISSION_GRANTS = {
  Employee: ['leave_type:read'],
};

const NEW_PERMISSION_GRANTS = {
  Employee: ['comp_off:read_own'],
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

    const allGrantedCodes = [
      ...new Set([
        ...Object.values(EXISTING_PERMISSION_GRANTS).flat(),
        ...Object.values(NEW_PERMISSION_GRANTS).flat(),
      ]),
    ];
    const roleNames = [...new Set([...Object.keys(EXISTING_PERMISSION_GRANTS), ...Object.keys(NEW_PERMISSION_GRANTS)])];

    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: roleNames }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: allGrantedCodes }, type: Sequelize.QueryTypes.SELECT }
    );

    const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

    const rows = [];
    for (const grants of [EXISTING_PERMISSION_GRANTS, NEW_PERMISSION_GRANTS]) {
      for (const [roleName, codes] of Object.entries(grants)) {
        const roleId = roleIdByName.get(roleName);
        if (!roleId) throw new Error(`Seed order error: role "${roleName}" not found.`);

        for (const code of codes) {
          const permissionId = permIdByCode.get(code);
          if (!permissionId) throw new Error(`Seed order error: permission "${code}" not found.`);
          rows.push({ role_id: roleId, permission_id: permissionId, created_at: now, updated_at: now });
        }
      }
    }

    await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', {
      code: NEW_PERMISSIONS.map(([, code]) => code),
    });
  },
};

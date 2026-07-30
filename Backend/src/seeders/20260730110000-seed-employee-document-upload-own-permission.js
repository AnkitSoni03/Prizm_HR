'use strict';

// Self-service document upload: an Employee can now upload their own
// documents (previously only employee_document:upload — held by Company
// Admin/HR Manager/holders of the "Document Verification" power — could
// ever create a document row at all). Added here rather than editing the
// already-applied base permission seeder, same convention as every other
// follow-up permission batch.
const NEW_PERMISSIONS = [
  ['org', 'employee_document:upload_own', "Upload the caller's own document"],
];

const NEW_PERMISSION_GRANTS = {
  Employee: ['employee_document:upload_own'],
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

    const codes = [...new Set(Object.values(NEW_PERMISSION_GRANTS).flat())];
    const roleNames = Object.keys(NEW_PERMISSION_GRANTS);

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
    for (const [roleName, roleCodes] of Object.entries(NEW_PERMISSION_GRANTS)) {
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

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', {
      code: NEW_PERMISSIONS.map(([, code]) => code),
    });
  },
};

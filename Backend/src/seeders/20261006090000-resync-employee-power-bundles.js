'use strict';

// Power bundles (config/powerCatalog.js) gained codes their pages were
// missing — most visibly at Group level, where only a power's own codes
// count in a sibling company:
//   roster              + leave_type:read, holiday:read, company_policy:read, brand:read
//   approve_requests    + comp_off:read/approve/reject
//   document_verification + designation:read
//   run_payroll         + brand:read
// A Role's codes are written at assignment time, so already-assigned powers
// don't pick these up by themselves. This re-applies each employee's CURRENT
// power levels (employees.custom_power_levels) onto their existing custom
// Roles — additive only, nothing is removed.
//
// Also grants HR Manager brand:read: several bundles include it, and "no one
// grants what they don't hold" (utils/powerAuthority.js) would otherwise
// stop an HR Manager granting them. It is a read of the company's own Brands.
const { POWER_CATALOG } = require('../config/powerCatalog');

function roleName(employeeId, level) {
  return level === 'company' ? `Custom Powers – ${employeeId}` : `Custom Powers – ${employeeId} (${level})`;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const select = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });
    const now = new Date();

    const permissions = await select('SELECT id, code FROM permissions');
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));
    const rows = [];

    const employees = await select(
      'SELECT id, company_id, custom_role_id, custom_power_levels FROM employees WHERE custom_power_levels IS NOT NULL'
    );
    for (const employee of employees) {
      const levels = employee.custom_power_levels || {};
      for (const [key, level] of Object.entries(levels)) {
        const power = POWER_CATALOG.find((p) => p.key === key);
        if (!power) continue;

        let roleId = null;
        if (level === 'company') {
          roleId = employee.custom_role_id;
        } else {
          const [role] = await select('SELECT id FROM roles WHERE company_id = :companyId AND name = :name', {
            companyId: employee.company_id,
            name: roleName(employee.id, level),
          });
          roleId = role ? role.id : null;
        }
        if (!roleId) continue;

        for (const code of power.permissionCodes) {
          const permissionId = permIdByCode.get(code);
          if (permissionId) rows.push({ role_id: roleId, permission_id: permissionId, created_at: now, updated_at: now });
        }
      }
    }

    const [hrManager] = await select("SELECT id FROM roles WHERE is_system = true AND name = 'HR Manager'");
    if (hrManager && permIdByCode.has('brand:read')) {
      rows.push({ role_id: hrManager.id, permission_id: permIdByCode.get('brand:read'), created_at: now, updated_at: now });
    }

    if (rows.length > 0) {
      await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
    }
  },

  // Additive data fix — nothing to undo safely (a removed code might have
  // been granted by an unrelated, later power assignment).
  async down() {},
};

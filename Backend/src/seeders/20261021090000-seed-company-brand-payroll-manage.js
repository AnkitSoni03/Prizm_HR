'use strict';

// Company Admin / HR Manager / Brand Admin now MANAGE payroll for their own
// scope (was view-only): payroll:manage on their ordinary, company-scoped
// role — company-wide for Company Admin / HR Manager, own Brand for Brand
// Admin (their UserRole carries brand_id). Only a GROUP-scoped grant of the
// same code reaches the whole Group (payrollAccess.js), so this never
// widens anyone past their company / brand. payroll:read stays.
const ROLES = ['Company Admin', 'HR Manager', 'Brand Admin'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const select = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });
    const now = new Date();

    const [permission] = await select("SELECT id FROM permissions WHERE code = 'payroll:manage'");
    if (!permission) throw new Error('Seed order error: payroll:manage not found (run 20261013090000 first).');
    const roles = await select('SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)', { names: ROLES });
    for (const name of ROLES) {
      if (!roles.some((r) => r.name === name)) throw new Error(`Seed order error: role "${name}" not found.`);
    }

    await queryInterface.bulkInsert(
      'role_permissions',
      roles.map((r) => ({ role_id: r.id, permission_id: permission.id, created_at: now, updated_at: now })),
      { ignoreDuplicates: true }
    );
  },

  async down(queryInterface, Sequelize) {
    const select = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });
    const roles = await select('SELECT id FROM roles WHERE is_system = true AND name IN (:names)', { names: ROLES });
    if (roles.length === 0) return;
    await queryInterface.sequelize.query(
      "DELETE FROM role_permissions WHERE role_id IN (:roleIds) AND permission_id = (SELECT id FROM permissions WHERE code = 'payroll:manage')",
      { replacements: { roleIds: roles.map((r) => r.id) } }
    );
  },
};

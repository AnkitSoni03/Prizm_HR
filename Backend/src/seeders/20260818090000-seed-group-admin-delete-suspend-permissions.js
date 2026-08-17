'use strict';

// Explicit ask: Group Admin gets delete rights over Company/Brand/Employee
// within their own Group, plus the active/deactivate toggle for a Company —
// all four codes already existed (held today only by Super Admin, via the
// 'ALL' wildcard) so this is purely new role_permissions rows, no new
// permission rows. Scoping to the caller's own Group is enforced service-side
// (company.controller.js::update/remove, brand.service.js::getBrandForWrite,
// employee.service.js::getEmployeeForWrite), not by this grant alone — a
// bare permission grant with no matching scope check would have let a Group
// Admin act on ANY Group's Company/Brand/Employee platform-wide, since their
// own company_id is null the same way Super Admin's is.
const CODES = ['company:delete', 'company:suspend', 'brand:delete', 'employee:delete'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const roles = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE is_system = true AND name = 'Group Admin'",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (roles.length === 0) throw new Error('Seed order error: role "Group Admin" not found.');
    const roleId = roles[0].id;

    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: CODES }, type: Sequelize.QueryTypes.SELECT }
    );
    if (permissions.length !== CODES.length) {
      const found = permissions.map((p) => p.code);
      const missing = CODES.filter((c) => !found.includes(c));
      throw new Error(`Seed order error: permission(s) not found: ${missing.join(', ')}`);
    }

    const rows = permissions.map((p) => ({ role_id: roleId, permission_id: p.id, created_at: now, updated_at: now }));
    await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    const roles = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE is_system = true AND name = 'Group Admin'",
      { type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: CODES }, type: Sequelize.QueryTypes.SELECT }
    );
    if (roles.length > 0 && permissions.length > 0) {
      await queryInterface.bulkDelete('role_permissions', {
        role_id: roles.map((r) => r.id),
        permission_id: permissions.map((p) => p.id),
      });
    }
  },
};

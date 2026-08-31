'use strict';

// Brand Admin gets full Company Policy write access, matching Company Admin/
// HR Manager — closes the deliberate asymmetry from
// 20260714100000-seed-company-policy-permissions.js's original grant
// (Brand Admin was read-only there). No new permission codes needed, all
// three already exist.
const ROLE_NAME = 'Brand Admin';
const CODES = ['company_policy:create', 'company_policy:update', 'company_policy:delete'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const [role] = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name = :name',
      { replacements: { name: ROLE_NAME }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) throw new Error(`Seed order error: role "${ROLE_NAME}" not found.`);

    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: CODES }, type: Sequelize.QueryTypes.SELECT }
    );
    if (permissions.length !== CODES.length) {
      throw new Error('Seed order error: not all company_policy permission codes exist yet.');
    }

    await queryInterface.bulkInsert(
      'role_permissions',
      permissions.map((p) => ({ role_id: role.id, permission_id: p.id, created_at: now, updated_at: now })),
      { ignoreDuplicates: true }
    );
  },

  async down(queryInterface, Sequelize) {
    const [role] = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name = :name',
      { replacements: { name: ROLE_NAME }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) return;

    const permissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: CODES }, type: Sequelize.QueryTypes.SELECT }
    );

    await queryInterface.bulkDelete('role_permissions', {
      role_id: role.id,
      permission_id: permissions.map((p) => p.id),
    });
  },
};

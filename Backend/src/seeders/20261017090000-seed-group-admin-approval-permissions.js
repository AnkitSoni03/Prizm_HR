'use strict';

// Group Admin gets the same approve / reject / revert powers Company Admin
// and Brand Admin have on leave, OD, attendance regularization and comp-off
// — for every company of their own Group. Revert (revoke) is gated on the
// `:approve` code, so no separate code is needed. The Group check itself
// lives in middleware/approvalAccess.js (leave/OD/comp-off) and
// attendanceRegularization.routes.js::allowGroupAdmin. All codes already
// exist; this only adds role_permissions rows.
const GROUP_ADMIN_CODES = [
  'leave_request:approve',
  'leave_request:reject',
  'od_request:approve',
  'od_request:reject',
  'attendance_regularization:approve',
  'attendance_regularization:reject',
  'comp_off:approve',
  'comp_off:reject',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const [role] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE is_system = true AND name = 'Group Admin' LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) throw new Error('Seed order error: role "Group Admin" not found.');

    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes) AND deleted_at IS NULL',
      { replacements: { codes: GROUP_ADMIN_CODES }, type: Sequelize.QueryTypes.SELECT }
    );
    const found = new Set(permissions.map((p) => p.code));
    const missing = GROUP_ADMIN_CODES.filter((code) => !found.has(code));
    if (missing.length) throw new Error(`Seed order error: permissions not found: ${missing.join(', ')}`);

    await queryInterface.bulkInsert(
      'role_permissions',
      permissions.map((p) => ({ role_id: role.id, permission_id: p.id, created_at: now, updated_at: now })),
      { ignoreDuplicates: true }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DELETE FROM role_permissions
        WHERE role_id IN (SELECT id FROM roles WHERE is_system = true AND name = 'Group Admin')
          AND permission_id IN (SELECT id FROM permissions WHERE code IN (:codes))`,
      { replacements: { codes: GROUP_ADMIN_CODES }, type: Sequelize.QueryTypes.SELECT }
    );
  },
};

'use strict';

// New system role, auto-granted (never manually assigned) by
// src/utils/hrTeamSync.js to any employee whose department is flagged
// departments.is_hr_department — additive on top of whatever role they
// already hold (Employee, from ESS activation), not a replacement.
// Deliberately narrower than the existing "HR Manager" role: exactly the
// two capabilities asked for (Yearly Holidays management, Leave Balance
// assignment) — no employee/shift/OD/attendance-approval powers. Both
// permission codes already exist (seeded in 20260707130000-seed-permissions.js)
// and are already granted to Company Admin, so no new permission rows are
// needed here, only a new role + its role_permissions grants.
const ROLE_NAME = 'HR Team';
const ROLE_DESCRIPTION = 'Auto-granted to any employee in a department flagged HR — holiday and leave balance management only';
const PERMISSION_CODES = [
  'holiday:read',
  'holiday:create',
  'holiday:update',
  'holiday:delete',
  'leave_balance:read',
  'leave_balance:adjust',
  // Needed to populate the leave-type dropdown when assigning a Leave
  // Balance (see EmployeeDetailModal.tsx's "Leave Balance" tab) — already
  // granted to Company Admin/HR Manager/Employee (the last via
  // 20260710090200-seed-ess-followup-permissions.js).
  'leave_type:read',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert(
      'roles',
      [
        {
          company_id: null,
          name: ROLE_NAME,
          is_system: true,
          description: ROLE_DESCRIPTION,
          created_at: now,
          updated_at: now,
        },
      ],
      { ignoreDuplicates: true }
    );

    const [role] = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name = :name',
      { replacements: { name: ROLE_NAME }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) throw new Error(`Seed order error: role "${ROLE_NAME}" not found after insert.`);

    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: PERMISSION_CODES }, type: Sequelize.QueryTypes.SELECT }
    );
    if (permissions.length !== PERMISSION_CODES.length) {
      const found = new Set(permissions.map((p) => p.code));
      const missing = PERMISSION_CODES.filter((code) => !found.has(code));
      throw new Error(`Seed order error: permission(s) not found: ${missing.join(', ')}`);
    }

    await queryInterface.bulkInsert(
      'role_permissions',
      permissions.map((permission) => ({
        role_id: role.id,
        permission_id: permission.id,
        created_at: now,
        updated_at: now,
      })),
      { ignoreDuplicates: true }
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', { name: ROLE_NAME, is_system: true, company_id: null });
  },
};

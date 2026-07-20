'use strict';

const SYSTEM_ROLE_NAMES = [
  'Super Admin',
  'Group Admin',
  'Company Admin',
  'Brand Admin',
  'HR Manager',
  'Employee',
];

// 'ALL' = every permission in the `permissions` table (used for Super Admin).
// Every other role lists exact resource:action codes. Scope rules from
// CLAUDE.md are respected here: Group Admin can't create Companies, Company
// Admin can't create Brands (only Super Admin creates Groups/Companies/Brands).
const ROLE_PERMISSIONS = {
  'Super Admin': 'ALL',

  'Group Admin': [
    'group:read', 'group:update',
    'company:read', 'company:update',
    'role:create', 'role:read', 'role:update', 'role:assign',
    'permission:read',
    'invitation:create', 'invitation:read', 'invitation:revoke',
    'brand:read',
    'department:read',
    'designation:read',
    'employee:read',
    'attendance:read',
    'leave_request:read',
    'holiday:read',
  ],

  'Company Admin': [
    'company:read', 'company:update',
    'role:create', 'role:read', 'role:update', 'role:delete', 'role:assign',
    'permission:read',
    'invitation:create', 'invitation:read', 'invitation:revoke',
    'user:invite', 'user:activate', 'user:disable', 'user:reset_password',
    'session:revoke',
    'brand:read',
    'department:create', 'department:read', 'department:update', 'department:delete',
    'designation:create', 'designation:read', 'designation:update', 'designation:delete',
    'employee:create', 'employee:read', 'employee:update', 'employee:delete', 'employee:transfer',
    'employee_document:upload', 'employee_document:read', 'employee_document:verify',
    'shift:create', 'shift:read', 'shift:update', 'shift:delete',
    'shift_roster:create', 'shift_roster:read', 'shift_roster:update',
    'attendance:read',
    'attendance_regularization:approve', 'attendance_regularization:reject',
    'employee_device:register', 'employee_device:revoke',
    'qr_terminal:create', 'qr_terminal:read',
    'od_request:approve', 'od_request:reject',
    'leave_type:create', 'leave_type:read', 'leave_type:update',
    'leave_policy:create', 'leave_policy:read', 'leave_policy:update',
    'leave_balance:read', 'leave_balance:adjust',
    'leave_request:read', 'leave_request:approve', 'leave_request:reject',
    'comp_off:credit', 'comp_off:read',
    'holiday:create', 'holiday:read', 'holiday:update', 'holiday:delete',
  ],

  'Brand Admin': [
    'brand:read',
    'department:read',
    'designation:read',
    'employee:read', 'employee:read_own',
    'employee_document:read',
    'attendance:read',
    'attendance_regularization:approve', 'attendance_regularization:reject',
    'shift_roster:read',
    'qr_terminal:read',
    'od_request:approve', 'od_request:reject',
    'leave_request:read', 'leave_request:approve', 'leave_request:reject',
    'holiday:read',
  ],

  'HR Manager': [
    'employee:create', 'employee:read', 'employee:update', 'employee:transfer',
    'employee_document:upload', 'employee_document:read', 'employee_document:verify',
    'department:read', 'department:update',
    'designation:read', 'designation:update',
    'invitation:create', 'invitation:read',
    'user:invite', 'user:activate', 'user:reset_password',
    'shift:create', 'shift:read', 'shift:update', 'shift:delete',
    'shift_roster:create', 'shift_roster:read', 'shift_roster:update',
    'attendance:read',
    'attendance_regularization:approve', 'attendance_regularization:reject',
    'employee_device:register', 'employee_device:revoke',
    'qr_terminal:create', 'qr_terminal:read',
    'od_request:approve', 'od_request:reject',
    'leave_type:read',
    'leave_policy:read',
    'leave_balance:read', 'leave_balance:adjust',
    'leave_request:read', 'leave_request:approve', 'leave_request:reject',
    'comp_off:credit', 'comp_off:read',
    'holiday:create', 'holiday:read', 'holiday:update', 'holiday:delete',
  ],

  Employee: [
    'employee:read_own',
    'employee_document:read_own',
    'attendance:mark', 'attendance:read_own',
    'attendance_regularization:request',
    'od_request:create',
    'leave_balance:read_own',
    'leave_request:create', 'leave_request:read_own', 'leave_request:cancel',
    'holiday:read',
  ],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: SYSTEM_ROLE_NAMES }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions',
      { type: Sequelize.QueryTypes.SELECT }
    );

    const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));
    const allPermissionIds = permissions.map((p) => p.id);

    const now = new Date();
    const rows = [];

    for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) {
        throw new Error(`Seed order error: role "${roleName}" not found. Run seed-roles first.`);
      }

      const permissionIds = codes === 'ALL' ? allPermissionIds : codes.map((code) => {
        const id = permIdByCode.get(code);
        if (!id) {
          throw new Error(`Seed order error: permission "${code}" not found. Run seed-permissions first.`);
        }
        return id;
      });

      for (const permissionId of permissionIds) {
        rows.push({
          role_id: roleId,
          permission_id: permissionId,
          created_at: now,
          updated_at: now,
        });
      }
    }

    await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    const roles = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: SYSTEM_ROLE_NAMES }, type: Sequelize.QueryTypes.SELECT }
    );
    const roleIds = roles.map((r) => r.id);
    if (roleIds.length === 0) return;

    await queryInterface.bulkDelete('role_permissions', { role_id: roleIds });
  },
};

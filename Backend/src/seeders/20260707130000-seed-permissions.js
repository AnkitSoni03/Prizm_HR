'use strict';

// resource:action codes for the modules built so far (Phase-1: tenancy, org)
// plus the next build phases already scoped in CLAUDE.md (attendance, leave)
// and a small "auth" module for identity/session actions that don't belong
// to a single business resource.
const PERMISSIONS = [
  // auth
  ['auth', 'user:invite', 'Invite a new user (creates invitation + pending user)'],
  ['auth', 'user:activate', 'Activate an invited user account'],
  ['auth', 'user:disable', 'Disable a user account'],
  ['auth', 'user:reset_password', 'Trigger or perform a password reset for a user'],
  ['auth', 'session:revoke', "Revoke a user's refresh tokens / active sessions"],

  // tenancy
  ['tenancy', 'group:create', 'Create a Group (Super Admin only)'],
  ['tenancy', 'group:read', 'View Group details'],
  ['tenancy', 'group:update', 'Update Group details'],
  ['tenancy', 'group:suspend', 'Suspend or reactivate a Group'],
  ['tenancy', 'company:create', 'Create a Company (Super Admin only)'],
  ['tenancy', 'company:read', 'View Company details'],
  ['tenancy', 'company:update', 'Update Company details'],
  ['tenancy', 'company:suspend', 'Suspend or reactivate a Company'],
  ['tenancy', 'role:create', 'Create a custom role'],
  ['tenancy', 'role:read', 'View roles'],
  ['tenancy', 'role:update', 'Update a role'],
  ['tenancy', 'role:delete', 'Delete a custom role'],
  ['tenancy', 'role:assign', 'Assign a role to a user'],
  ['tenancy', 'permission:read', 'View the master permission list'],
  ['tenancy', 'invitation:create', 'Invite a user with a scoped role'],
  ['tenancy', 'invitation:read', 'View pending/past invitations'],
  ['tenancy', 'invitation:revoke', 'Revoke a pending invitation'],

  // org
  ['org', 'brand:create', 'Create a Brand (Super Admin only)'],
  ['org', 'brand:read', 'View Brand details'],
  ['org', 'brand:update', 'Update Brand details'],
  ['org', 'brand:delete', 'Delete a Brand'],
  ['org', 'department:create', 'Create a Department'],
  ['org', 'department:read', 'View Department details'],
  ['org', 'department:update', 'Update Department details'],
  ['org', 'department:delete', 'Delete a Department'],
  ['org', 'designation:create', 'Create a Designation'],
  ['org', 'designation:read', 'View Designation details'],
  ['org', 'designation:update', 'Update Designation details'],
  ['org', 'designation:delete', 'Delete a Designation'],
  ['org', 'employee:create', 'Create an Employee record'],
  ['org', 'employee:read', 'View any Employee record'],
  ['org', 'employee:read_own', "View the caller's own Employee record"],
  ['org', 'employee:update', 'Update an Employee record'],
  ['org', 'employee:delete', 'Delete/exit an Employee record'],
  ['org', 'employee:transfer', "Change an Employee's Brand or Department"],
  ['org', 'employee_document:upload', 'Upload a document for an Employee'],
  ['org', 'employee_document:read', "View any Employee's documents"],
  ['org', 'employee_document:read_own', "View the caller's own documents"],
  ['org', 'employee_document:verify', 'Mark an Employee document as HR-verified'],

  // attendance
  ['attendance', 'shift:create', 'Create a Shift definition'],
  ['attendance', 'shift:read', 'View Shift definitions'],
  ['attendance', 'shift:update', 'Update a Shift definition'],
  ['attendance', 'shift:delete', 'Delete a Shift definition'],
  ['attendance', 'shift_roster:create', 'Create a per-employee, per-date roster entry'],
  ['attendance', 'shift_roster:read', 'View roster entries'],
  ['attendance', 'shift_roster:update', 'Update a roster entry'],
  ['attendance', 'attendance:mark', 'Mark own attendance via QR scan'],
  ['attendance', 'attendance:read', 'View attendance records for others'],
  ['attendance', 'attendance:read_own', 'View own attendance records'],
  ['attendance', 'attendance_regularization:request', 'Request an attendance regularization'],
  ['attendance', 'attendance_regularization:approve', 'Approve a regularization request'],
  ['attendance', 'attendance_regularization:reject', 'Reject a regularization request'],
  ['attendance', 'employee_device:register', "Register a device for an employee's QR flow"],
  ['attendance', 'employee_device:revoke', 'Revoke a registered device'],
  ['attendance', 'qr_terminal:create', 'Register a QR attendance terminal'],
  ['attendance', 'qr_terminal:read', 'View QR attendance terminals'],
  ['attendance', 'od_request:create', 'Create an on-duty (OD) request'],
  ['attendance', 'od_request:approve', 'Approve an OD request'],
  ['attendance', 'od_request:reject', 'Reject an OD request'],

  // leave
  ['leave', 'leave_type:create', 'Create a leave type'],
  ['leave', 'leave_type:read', 'View leave types'],
  ['leave', 'leave_type:update', 'Update a leave type'],
  ['leave', 'leave_policy:create', 'Create a leave policy'],
  ['leave', 'leave_policy:read', 'View leave policies'],
  ['leave', 'leave_policy:update', 'Update a leave policy'],
  ['leave', 'leave_balance:read', "View any employee's leave balance"],
  ['leave', 'leave_balance:read_own', 'View own leave balance'],
  ['leave', 'leave_balance:adjust', 'Manually adjust a leave balance'],
  ['leave', 'leave_request:create', 'Create own leave request'],
  ['leave', 'leave_request:read', 'View leave requests for others'],
  ['leave', 'leave_request:read_own', 'View own leave requests'],
  ['leave', 'leave_request:approve', 'Approve a leave request'],
  ['leave', 'leave_request:reject', 'Reject a leave request'],
  ['leave', 'leave_request:cancel', 'Cancel own leave request'],
  ['leave', 'comp_off:credit', 'Credit a comp-off to an employee'],
  ['leave', 'comp_off:read', 'View comp-off credits'],
  ['leave', 'holiday:create', 'Create a holiday'],
  ['leave', 'holiday:read', 'View holidays'],
  ['leave', 'holiday:update', 'Update a holiday'],
  ['leave', 'holiday:delete', 'Delete a holiday'],
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert(
      'permissions',
      PERMISSIONS.map(([module, code, description]) => ({
        module,
        code,
        description,
        created_at: now,
        updated_at: now,
      })),
      { ignoreDuplicates: true }
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', {
      code: PERMISSIONS.map(([, code]) => code),
    });
  },
};

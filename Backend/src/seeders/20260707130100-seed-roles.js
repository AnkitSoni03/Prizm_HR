'use strict';

// System role templates: company_id NULL marks these as platform-defined
// roles (per PHASE1_MODELS.md's `roles.company_id` note), not tied to one
// tenant. Scope at assignment time comes from user_roles.company_id/brand_id,
// not from these rows.
const SYSTEM_ROLES = [
  ['Super Admin', 'Full platform access across all Groups and Companies'],
  ['Group Admin', 'Manages Companies, roles and users within a Group'],
  ['Company Admin', 'Manages a Company: org structure, roles, users, policies'],
  ['Brand Admin', 'Manages day-to-day operations for a single Brand'],
  ['HR Manager', 'Runs HR operations (employees, attendance, leave) for a Company'],
  ['Employee', 'Self-service access: own attendance, leave and profile'],
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert(
      'roles',
      SYSTEM_ROLES.map(([name, description]) => ({
        company_id: null,
        name,
        is_system: true,
        description,
        created_at: now,
        updated_at: now,
      })),
      { ignoreDuplicates: true }
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', {
      name: SYSTEM_ROLES.map(([name]) => name),
      is_system: true,
      company_id: null,
    });
  },
};

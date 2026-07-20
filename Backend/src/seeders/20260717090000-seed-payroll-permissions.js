'use strict';

// Payroll is a brand-new module. Grant distribution mirrors the existing
// Company Policy/Holiday asymmetry: write access stays at Company Admin/HR
// Manager tier by default (also delegable per-employee via powerCatalog.js's
// new 'run_payroll' bundle); every Employee gets payslip:read_own so they
// can see their own pay.
const PERMISSIONS = [
  ['payroll', 'payroll_settings:read', 'View company payroll settings'],
  ['payroll', 'payroll_settings:update', 'Update company payroll settings'],
  ['payroll', 'salary_component:create', 'Create a salary component definition'],
  ['payroll', 'salary_component:read', 'View salary component definitions'],
  ['payroll', 'salary_component:update', 'Update a salary component definition'],
  ['payroll', 'salary_component:delete', 'Disable a salary component definition'],
  ['payroll', 'salary_structure:create', 'Assign an employee salary structure'],
  ['payroll', 'salary_structure:read', 'View employee salary structures'],
  ['payroll', 'salary_structure:update', 'Revise an employee salary structure'],
  ['payroll', 'payroll_adjustment:create', 'Create a payroll adjustment (bonus/deduction)'],
  ['payroll', 'payroll_adjustment:read', 'View payroll adjustments'],
  ['payroll', 'payroll_adjustment:update', 'Update a pending payroll adjustment'],
  ['payroll', 'payroll_adjustment:delete', 'Cancel a pending payroll adjustment'],
  ['payroll', 'payroll_run:create', 'Create a draft payroll run'],
  ['payroll', 'payroll_run:read', 'View payroll runs'],
  ['payroll', 'payroll_run:process', 'Process a draft payroll run'],
  ['payroll', 'payroll_run:pay', 'Mark a processed payroll run as paid'],
  ['payroll', 'payroll_run:cancel', 'Cancel a draft payroll run'],
  ['payroll', 'payslip:read', 'View any employee\'s payslips, company-wide'],
  ['payroll', 'payslip:read_own', 'View own payslips'],
];

const ALL_ADMIN_CODES = PERMISSIONS.map(([, code]) => code).filter((code) => code !== 'payslip:read_own');

const ROLE_GRANTS = {
  'Company Admin': ALL_ADMIN_CODES,
  'HR Manager': ALL_ADMIN_CODES,
  // Brand Admin / Group Admin intentionally get no payroll:* codes in v1 —
  // payroll runs are company-wide only; revisit if either portal needs
  // read-only payroll visibility later.
  Employee: ['payslip:read_own'],
};

module.exports = {
  async up(queryInterface, Sequelize) {
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

    const roles = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)',
      { replacements: { names: Object.keys(ROLE_GRANTS) }, type: Sequelize.QueryTypes.SELECT }
    );
    const permissions = await queryInterface.sequelize.query(
      'SELECT id, code FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: PERMISSIONS.map(([, code]) => code) }, type: Sequelize.QueryTypes.SELECT }
    );

    const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

    const rows = [];
    for (const [roleName, codes] of Object.entries(ROLE_GRANTS)) {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) throw new Error(`Seed order error: role "${roleName}" not found.`);

      for (const code of codes) {
        const permissionId = permIdByCode.get(code);
        if (!permissionId) throw new Error(`Seed order error: permission "${code}" not found.`);
        rows.push({ role_id: roleId, permission_id: permissionId, created_at: now, updated_at: now });
      }
    }

    await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', {
      code: PERMISSIONS.map(([, code]) => code),
    });
  },
};

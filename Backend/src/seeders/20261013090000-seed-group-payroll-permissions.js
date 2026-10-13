'use strict';

// Group-level payroll (modules/payroll/) replaces the old company-level one:
//   payroll:manage   — Group Admin, and the "Manage Payroll" power (Group
//                      level only — config/powerCatalog.js). Templates,
//                      deductions, salary assignment, payslip approvals.
//   payroll:read     — Company Admin / HR Manager / Brand Admin: view only.
//   payroll:read_own — every Employee: own salary, payslip requests.
// Every old payroll code is revoked from every role (role_permissions rows
// hard-deleted, same precedent as 20260803110000; the permissions rows stay
// dormant). An employee who held the old "Manage & Run Payroll" power at
// Group level keeps it (their group Role gets payroll:manage); at Company
// level it no longer exists and is dropped from custom_power_levels.
const PERMISSIONS = [
  ['payroll', 'payroll:manage', 'Manage group payroll: salary templates, deductions, salary assignment, payslip approvals'],
  ['payroll', 'payroll:read', 'View payroll of your company / brand'],
  ['payroll', 'payroll:read_own', 'View your own salary and request payslips'],
];

const ROLE_GRANTS = {
  'Group Admin': ['payroll:manage'],
  'Company Admin': ['payroll:read'],
  'HR Manager': ['payroll:read'],
  'Brand Admin': ['payroll:read'],
  Employee: ['payroll:read_own'],
};

const OLD_CODES = [
  'payroll_settings:read', 'payroll_settings:update',
  'salary_component:create', 'salary_component:read', 'salary_component:update', 'salary_component:delete',
  'salary_structure:create', 'salary_structure:read', 'salary_structure:update',
  'payroll_adjustment:create', 'payroll_adjustment:read', 'payroll_adjustment:update', 'payroll_adjustment:delete',
  'payroll_run:create', 'payroll_run:read', 'payroll_run:process', 'payroll_run:pay', 'payroll_run:cancel',
  'payslip:read', 'payslip:read_own',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const select = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });
    const now = new Date();

    await queryInterface.bulkInsert(
      'permissions',
      PERMISSIONS.map(([module, code, description]) => ({ module, code, description, created_at: now, updated_at: now })),
      { ignoreDuplicates: true }
    );

    const roles = await select('SELECT id, name FROM roles WHERE is_system = true AND name IN (:names)', {
      names: Object.keys(ROLE_GRANTS),
    });
    const permissions = await select('SELECT id, code FROM permissions WHERE code IN (:codes)', {
      codes: PERMISSIONS.map(([, code]) => code),
    });
    const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
    const permIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

    const rows = [];
    for (const [roleName, codes] of Object.entries(ROLE_GRANTS)) {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) throw new Error(`Seed order error: role "${roleName}" not found.`);
      for (const code of codes) {
        rows.push({ role_id: roleId, permission_id: permIdByCode.get(code), created_at: now, updated_at: now });
      }
    }

    // Existing "Manage & Run Payroll" power holders.
    const holders = await select(
      "SELECT id, company_id, custom_power_levels FROM employees WHERE custom_power_levels ->> 'run_payroll' IS NOT NULL"
    );
    for (const employee of holders) {
      const level = employee.custom_power_levels.run_payroll;
      if (level === 'group') {
        const [role] = await select('SELECT id FROM roles WHERE company_id = :companyId AND name = :name', {
          companyId: employee.company_id,
          name: `Custom Powers – ${employee.id} (group)`,
        });
        if (role) rows.push({ role_id: role.id, permission_id: permIdByCode.get('payroll:manage'), created_at: now, updated_at: now });
      } else {
        await queryInterface.sequelize.query(
          "UPDATE employees SET custom_power_levels = custom_power_levels - 'run_payroll' WHERE id = :id",
          { replacements: { id: employee.id } }
        );
      }
    }

    await queryInterface.sequelize.query(
      'DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code IN (:codes))',
      { replacements: { codes: OLD_CODES } }
    );

    await queryInterface.bulkInsert('role_permissions', rows, { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', { code: PERMISSIONS.map(([, code]) => code) });
  },
};

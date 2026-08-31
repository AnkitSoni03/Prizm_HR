'use strict';

// Follow-up to 20260831093000's full Company-Admin-parity grant, per explicit
// ask: a Brand Admin must only manage their OWN brand's payroll, not other
// brands in the same company. Payroll tables have no brand_id anywhere
// (company_id + employee_id only — see CLAUDE.md), and a PayrollRun in
// particular has no employee_id at all: one run is a single batch that
// processes every employee in the company together (proration/statutory/TDS
// engine). There is no way to "run payroll for just one brand" without
// restructuring that engine, so run creation/processing/paying/cancelling
// stays Company-Admin-only — revoked here for Brand Admin (payroll_run:read
// is kept, so Brand Admin can still see a run exists; the payslip line items
// inside it are brand-filtered at the service layer instead, see
// payslip.service.js/payrollAdjustment.service.js/salaryStructure.service.js).
//
// payroll_settings:update (PF/ESI/PT/TDS rates) is also revoked — it's one
// legal, company-wide configuration, not something that varies per brand.
// payroll_settings:read is kept.
//
// Everything else granted in 20260831093000 (Leave, Comp-Off, Employee
// Shift/Document, Invitations, Company read/update, Payroll
// Adjustments/Salary Structures/Salary Components/Payslip:read, User admin,
// Role management) is unaffected — those are now enforced at the service
// layer to the caller's own brand where an employee dimension exists
// (Payroll Adjustments/Salary Structures/Payslips), or are legitimately
// company-wide catalogs with no brand dimension to scope by (Salary
// Component definitions, same precedent as Department/Designation/Shift).
const ROLE_NAME = 'Brand Admin';
const REVOKED_CODES = [
  'payroll_run:create',
  'payroll_run:process',
  'payroll_run:pay',
  'payroll_run:cancel',
  'payroll_settings:update',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const [role] = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name = :name',
      { replacements: { name: ROLE_NAME }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) throw new Error(`Seed order error: role "${ROLE_NAME}" not found.`);

    const permissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: REVOKED_CODES }, type: Sequelize.QueryTypes.SELECT }
    );

    // Hard-delete the join rows only (role_permissions is paranoid but never
    // actually soft-deleted anywhere in this app — same reasoning as
    // employee.service.js::assignEmployeePowers) so a future re-grant of the
    // same (role_id, permission_id) composite PK is never silently blocked.
    await queryInterface.sequelize.query(
      'DELETE FROM role_permissions WHERE role_id = :roleId AND permission_id IN (:permIds)',
      { replacements: { roleId: role.id, permIds: permissions.map((p) => p.id) } }
    );
  },

  async down(queryInterface, Sequelize) {
    const now = new Date();
    const [role] = await queryInterface.sequelize.query(
      'SELECT id FROM roles WHERE is_system = true AND name = :name',
      { replacements: { name: ROLE_NAME }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!role) return;

    const permissions = await queryInterface.sequelize.query(
      'SELECT id FROM permissions WHERE code IN (:codes)',
      { replacements: { codes: REVOKED_CODES }, type: Sequelize.QueryTypes.SELECT }
    );

    await queryInterface.bulkInsert(
      'role_permissions',
      permissions.map((p) => ({ role_id: role.id, permission_id: p.id, created_at: now, updated_at: now })),
      { ignoreDuplicates: true }
    );
  },
};

'use strict';

// Companion to 20260810090100, which tears down the "is HR department"
// auto-grant feature (department.service.js's isHrDepartment handling,
// hrTeamSync.js, and the seeded "HR Team" role) — removed because it fully
// duplicated what the per-employee "Powers" feature
// (employee.service.js::assignEmployeePowers, powerCatalog.js) already does
// with finer, per-employee, admin-picked control: the 'holidays' bundle
// (holiday:create/update/delete) and 'assign_leaves' bundle
// (leave_balance:read/adjust + employee:read/department:read/brand:read,
// needed to browse the employee directory when assigning a balance) are
// exactly the two capabilities the HR Team role ever granted.
//
// Before that teardown runs, this migration retroactively grants those same
// two Powers to every employee who currently holds the HR Team role, via the
// identical custom-Role mechanism assignEmployeePowers itself uses (a
// dedicated per-employee, company-scoped, is_system=false Role referenced by
// employees.custom_role_id), so nobody silently loses access. holiday:read
// and leave_type:read are deliberately excluded here — both are already
// broadly granted to every base role (see powerCatalog.js's own comment),
// same as a real Powers assignment would produce.
const POWER_PERMISSION_CODES = [
  'holiday:create', 'holiday:update', 'holiday:delete',
  'leave_balance:read', 'leave_balance:adjust',
  'employee:read', 'department:read', 'brand:read',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const [hrTeamRole] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE is_system = true AND name = 'HR Team'`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (!hrTeamRole) return; // Never seeded/used in this environment.

    const holders = await queryInterface.sequelize.query(
      `
      SELECT e.id AS employee_id, e.user_id, e.company_id, e.custom_role_id
      FROM user_roles ur
      JOIN employees e ON e.user_id = ur.user_id AND e.company_id = ur.company_id
      WHERE ur.role_id = :roleId AND ur.deleted_at IS NULL AND e.deleted_at IS NULL
      `,
      { replacements: { roleId: hrTeamRole.id }, type: Sequelize.QueryTypes.SELECT }
    );
    if (holders.length === 0) return;

    const permissions = await queryInterface.sequelize.query(
      `SELECT id, code FROM permissions WHERE code IN (:codes)`,
      { replacements: { codes: POWER_PERMISSION_CODES }, type: Sequelize.QueryTypes.SELECT }
    );
    if (permissions.length === 0) return;

    const now = new Date();

    for (const holder of holders) {
      let roleId = holder.custom_role_id;

      if (!roleId) {
        const roleName = `Custom Powers – ${holder.employee_id}`;
        await queryInterface.sequelize.query(
          `
          INSERT INTO roles (company_id, name, is_system, description, created_at, updated_at)
          VALUES (:companyId, :name, false, 'Per-employee custom powers', :now, :now)
          ON CONFLICT (company_id, name) DO NOTHING
          `,
          { replacements: { companyId: holder.company_id, name: roleName, now } }
        );
        const [role] = await queryInterface.sequelize.query(
          `SELECT id FROM roles WHERE company_id = :companyId AND name = :name`,
          { replacements: { companyId: holder.company_id, name: roleName }, type: Sequelize.QueryTypes.SELECT }
        );
        roleId = role.id;
        await queryInterface.sequelize.query(
          `UPDATE employees SET custom_role_id = :roleId, updated_at = :now WHERE id = :employeeId`,
          { replacements: { roleId, now, employeeId: holder.employee_id } }
        );
      }

      for (const permission of permissions) {
        await queryInterface.sequelize.query(
          `
          INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
          VALUES (:roleId, :permissionId, :now, :now)
          ON CONFLICT (role_id, permission_id) DO NOTHING
          `,
          { replacements: { roleId, permissionId: permission.id, now } }
        );
      }

      const [existingGrant] = await queryInterface.sequelize.query(
        `
        SELECT id FROM user_roles
        WHERE user_id = :userId AND role_id = :roleId AND company_id = :companyId AND deleted_at IS NULL
        `,
        {
          replacements: { userId: holder.user_id, roleId, companyId: holder.company_id },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      if (!existingGrant) {
        await queryInterface.sequelize.query(
          `
          INSERT INTO user_roles (user_id, role_id, company_id, brand_id, created_at, updated_at)
          VALUES (:userId, :roleId, :companyId, NULL, :now, :now)
          `,
          { replacements: { userId: holder.user_id, roleId, companyId: holder.company_id, now } }
        );
      }
    }
  },

  // Not reversed — same reasoning as other backfill migrations in this repo
  // (e.g. 20260806090000): by the time a rollback would run, an admin may
  // have hand-edited these employees' Powers already, so blindly stripping
  // them back out could remove access an admin explicitly kept.
  async down() {},
};

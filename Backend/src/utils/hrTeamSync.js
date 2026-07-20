'use strict';

const db = require('../models');
const { runWithTenant } = require('../config/tenant-context');

const HR_TEAM_ROLE_NAME = 'HR Team';

// Grants or revokes the HR Team role (see seeders/*-seed-hr-team-role.js)
// for an employee's linked ESS user account, based on whether their
// *current* department is flagged HR (departments.is_hr_department) — every
// employee in that department is HR "not matter they are junior or senior",
// on top of whatever role they already hold (Employee, from ESS activation)
// rather than replacing it. Idempotent — safe to call repeatedly (every
// transfer, every department update) without creating duplicate UserRole
// rows or erroring on a grant that's already gone. No-ops for an employee
// with no linked userId (hasn't activated ESS access yet) — activation
// itself calls this once employeeId is known.
//
// Every model touched here (Role/UserRole/Employee/Department) is
// tenant-scoped (src/models/hooks/tenant-scope.js). Callers of this function
// run under widely different tenant contexts — transferEmployee/
// updateDepartment run under the acting Company Admin's own companyId,
// activateAccount runs under no context at all (public route) — and HR
// Team's own company_id is NULL (system role), so a non-null ambient
// context would silently filter it to zero rows (CLAUDE.md's "tenant-scope
// hook + system-level rows" gotcha). Nesting a null-company context for the
// whole function, same fix already used in
// auth.service.js::inviteEmployeeUser, makes every `where` clause below the
// sole source of truth regardless of what the caller was running under.
async function syncHrTeamRole({ employeeId, transaction }) {
  await runWithTenant({ companyId: null }, async () => {
    const employee = await db.Employee.findByPk(employeeId, { transaction });
    if (!employee || !employee.userId) return;

    const department = employee.departmentId
      ? await db.Department.findByPk(employee.departmentId, { transaction })
      : null;
    const shouldHaveHrTeam = !!(department && department.isHrDepartment);

    const role = await db.Role.findOne({
      where: { name: HR_TEAM_ROLE_NAME, isSystem: true },
      transaction,
    });
    if (!role) return;

    const existingGrant = await db.UserRole.findOne({
      where: { userId: employee.userId, roleId: role.id, companyId: employee.companyId },
      transaction,
    });

    if (shouldHaveHrTeam && !existingGrant) {
      await db.UserRole.create(
        { userId: employee.userId, roleId: role.id, companyId: employee.companyId, groupId: null, brandId: null },
        { transaction }
      );
    } else if (!shouldHaveHrTeam && existingGrant) {
      await existingGrant.destroy({ transaction });
    }
  });
}

module.exports = { syncHrTeamRole, HR_TEAM_ROLE_NAME };

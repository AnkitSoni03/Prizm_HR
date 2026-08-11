'use strict';

const db = require('../models');
const { runWithTenant } = require('../config/tenant-context');

// Ensures the employee's linked ESS user account (if any) actually holds a
// UserRole grant for their dedicated "powers" Role (employees.custom_role_id
// — see employee.service.js::assignEmployeePowers, which is the only place
// that ever creates/updates the Role itself and its role_permissions).
// This function only ever *creates* the UserRole row if missing — it never
// destroys it, since revoking a power is done by emptying that Role's
// role_permissions (see assignEmployeePowers), not by removing the grant.
//
// Idempotent, safe to call repeatedly. No-ops when either the employee has
// no custom role assigned yet, or has no linked ESS login yet. Nests a
// null-company tenant context because Employee/Role/UserRole are all
// tenant-scoped and callers here run under varying/absent contexts —
// activateAccount runs under none at all.
async function ensureCustomRoleGrant({ employeeId, transaction }) {
  await runWithTenant({ companyId: null }, async () => {
    const employee = await db.Employee.findByPk(employeeId, { transaction });
    if (!employee || !employee.userId || !employee.customRoleId) return;

    const existingGrant = await db.UserRole.findOne({
      where: { userId: employee.userId, roleId: employee.customRoleId, companyId: employee.companyId },
      transaction,
    });
    if (existingGrant) return;

    await db.UserRole.create(
      {
        userId: employee.userId,
        roleId: employee.customRoleId,
        companyId: employee.companyId,
        groupId: null,
        brandId: null,
      },
      { transaction }
    );
  });
}

module.exports = { ensureCustomRoleGrant };

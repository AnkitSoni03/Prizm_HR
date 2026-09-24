'use strict';

const db = require('../models');
const { runWithTenant } = require('../config/tenant-context');

// An employee's hand-picked "powers" (config/powerCatalog.js) live in up to
// three dedicated, employee-owned Roles — one per scope level — because a
// Role's permissions all share the scope of the UserRole row that grants
// them:
//   company — employees.custom_role_id (the original, pre-levels role)
//   brand   — `Custom Powers – <id> (brand)`, granted with brand_id = the
//             employee's own Brand
//   group   — `Custom Powers – <id> (group)`, granted with group_id = the
//             employee's company's Group (see auth.middleware.js's
//             X-Acting-Company-Id handling for how it reaches sibling
//             companies)
// employee.service.js::assignEmployeePowers is the only writer of these
// Roles' role_permissions; this file only keeps the UserRole grants in step.
const POWER_LEVELS = ['brand', 'company', 'group'];

function customPowerRoleName(employeeId, level) {
  return level === 'company' ? `Custom Powers – ${employeeId}` : `Custom Powers – ${employeeId} (${level})`;
}

// { brand?: Role, company?: Role, group?: Role } — only the ones that exist.
async function findCustomPowerRoles(employee, transaction) {
  const roles = {};
  if (employee.customRoleId) {
    const role = await db.Role.findByPk(employee.customRoleId, { transaction });
    if (role) roles.company = role;
  }
  for (const level of ['brand', 'group']) {
    const role = await db.Role.findOne({
      where: { companyId: employee.companyId, name: customPowerRoleName(employee.id, level) },
      transaction,
    });
    if (role) roles[level] = role;
  }
  return roles;
}

// Ensures the employee's linked ESS user (if any) holds exactly one
// correctly-scoped UserRole per existing custom power Role. Idempotent, safe
// to call repeatedly — at activation (auth.service.js::activateAccount),
// after powers change, and after a Brand transfer (so a brand-level grant
// follows the employee to their new Brand instead of staying pinned to the
// old one). Revoking a power is done by emptying a Role's role_permissions,
// not by removing the grant — except a brand-level grant for an employee who
// no longer has a Brand at all, which has nothing valid to point at and is
// removed. Nests a null-company tenant context because Employee/Role/
// UserRole are all tenant-scoped and callers run under varying/absent
// contexts — activateAccount runs under none at all.
async function ensureCustomRoleGrant({ employeeId, transaction }) {
  await runWithTenant({ companyId: null }, async () => {
    const employee = await db.Employee.findByPk(employeeId, { transaction });
    if (!employee || !employee.userId) return;

    const roles = await findCustomPowerRoles(employee, transaction);
    if (Object.keys(roles).length === 0) return;

    const company = await db.Company.findByPk(employee.companyId, { attributes: ['id', 'groupId'], transaction });

    for (const level of POWER_LEVELS) {
      const role = roles[level];
      if (!role) continue;

      const existing = await db.UserRole.findOne({
        where: { userId: employee.userId, roleId: role.id },
        transaction,
      });

      if (level === 'brand' && !employee.brandId) {
        if (existing) await existing.destroy({ force: true, transaction });
        continue;
      }

      const desired = {
        companyId: employee.companyId,
        brandId: level === 'brand' ? employee.brandId : null,
        // A company with no Group can't have sibling companies — the grant
        // then simply behaves as company level.
        groupId: level === 'group' && company ? company.groupId : null,
      };

      if (!existing) {
        await db.UserRole.create({ userId: employee.userId, roleId: role.id, ...desired }, { transaction });
      } else if (
        String(existing.companyId) !== String(desired.companyId) ||
        String(existing.brandId) !== String(desired.brandId) ||
        String(existing.groupId) !== String(desired.groupId)
      ) {
        await existing.update(desired, { transaction });
      }
    }
  });
}

module.exports = { ensureCustomRoleGrant, findCustomPowerRoles, customPowerRoleName, POWER_LEVELS };

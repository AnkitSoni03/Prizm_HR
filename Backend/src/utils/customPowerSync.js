'use strict';

const { Op } = require('sequelize');
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
const CUSTOM_POWER_ROLE_PREFIX = 'Custom Powers';

function customPowerRoleName(employeeId, level) {
  return level === 'company' ? `Custom Powers – ${employeeId}` : `Custom Powers – ${employeeId} (${level})`;
}

// A Group-level power limited to chosen companies gets a Role of its own —
// its grant carries user_roles.allowed_company_ids, so it can't share the
// "(group)" Role, whose powers reach every company of the Group.
function limitedGroupRoleName(employeeId, powerKey) {
  return `Custom Powers – ${employeeId} (group:${powerKey})`;
}
const limitedGroupRolePrefix = (employeeId) => `Custom Powers – ${employeeId} (group:`;

// Likewise a Company-level power limited to chosen brands: its Role is
// granted once per chosen brand (UserRole.brand_id = that brand), which
// rbac.middleware.js::getBrandScope already reads as "these brands only".
function limitedBrandRoleName(employeeId, powerKey) {
  return `Custom Powers – ${employeeId} (brands:${powerKey})`;
}
const limitedBrandRolePrefix = (employeeId) => `Custom Powers – ${employeeId} (brands:`;

// Clean company-id list for allowed_company_ids: numbers, unique, sorted.
function normalizeCompanyIds(ids) {
  return [...new Set(ids.map(Number))].sort((a, b) => a - b);
}

// { brand?, company?, group?, groupLimited?: { powerKey: Role },
//   brandLimited?: { powerKey: Role } } — only the ones that exist.
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
  const limited = await db.Role.findAll({
    where: { companyId: employee.companyId, name: { [Op.like]: `${limitedGroupRolePrefix(employee.id)}%` } },
    transaction,
  });
  for (const role of limited) {
    const key = role.name.slice(limitedGroupRolePrefix(employee.id).length, -1);
    roles.groupLimited = roles.groupLimited || {};
    roles.groupLimited[key] = role;
  }
  const brandLimited = await db.Role.findAll({
    where: { companyId: employee.companyId, name: { [Op.like]: `${limitedBrandRolePrefix(employee.id)}%` } },
    transaction,
  });
  for (const role of brandLimited) {
    const key = role.name.slice(limitedBrandRolePrefix(employee.id).length, -1);
    roles.brandLimited = roles.brandLimited || {};
    roles.brandLimited[key] = role;
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

    const sameIds = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const limits = employee.customPowerCompanies || {};
    const grants = POWER_LEVELS.filter((level) => roles[level]).map((level) => ({ level, role: roles[level], allowed: null }));
    for (const [key, role] of Object.entries(roles.groupLimited || {})) {
      // A limited Role whose list went missing is granted nowhere (empty
      // list) rather than everywhere.
      grants.push({ level: 'group', role, allowed: normalizeCompanyIds(Array.isArray(limits[key]) ? limits[key] : []) });
    }

    for (const { level, role, allowed } of grants) {

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
        allowedCompanyIds: allowed,
      };

      if (!existing) {
        await db.UserRole.create({ userId: employee.userId, roleId: role.id, ...desired }, { transaction });
      } else if (
        String(existing.companyId) !== String(desired.companyId) ||
        String(existing.brandId) !== String(desired.brandId) ||
        String(existing.groupId) !== String(desired.groupId) ||
        !sameIds(existing.allowedCompanyIds, desired.allowedCompanyIds)
      ) {
        await existing.update(desired, { transaction });
      }
    }

    // Brand-limited Company-level powers: exactly one grant per chosen brand.
    const brandLimits = employee.customPowerBrands || {};
    for (const [key, role] of Object.entries(roles.brandLimited || {})) {
      const wanted = new Set((Array.isArray(brandLimits[key]) ? brandLimits[key] : []).map(String));
      const existingGrants = await db.UserRole.findAll({ where: { userId: employee.userId, roleId: role.id }, transaction });
      for (const row of existingGrants) {
        const keep =
          String(row.companyId) === String(employee.companyId) &&
          row.brandId !== null &&
          row.groupId === null &&
          wanted.has(String(row.brandId));
        if (keep) {
          wanted.delete(String(row.brandId));
          continue;
        }
        await row.destroy({ force: true, transaction });
      }
      for (const brandId of wanted) {
        await db.UserRole.create(
          { userId: employee.userId, roleId: role.id, companyId: employee.companyId, brandId, groupId: null, allowedCompanyIds: null },
          { transaction }
        );
      }
    }
  });
}

module.exports = {
  ensureCustomRoleGrant,
  findCustomPowerRoles,
  customPowerRoleName,
  limitedGroupRoleName,
  limitedGroupRolePrefix,
  limitedBrandRoleName,
  limitedBrandRolePrefix,
  normalizeCompanyIds,
  POWER_LEVELS,
  CUSTOM_POWER_ROLE_PREFIX,
};

'use strict';

const { HttpError } = require('./errors');
const db = require('../models');

// Shared by every domain that gained an optional brand_id dimension in the
// same pass as this file (departments, designations, shifts, roster_groups,
// leave_types, leave_policies, company_policies, comp_off_policies) —
// mirrors the brand-scoping convention holiday.service.js established
// first, extracted here so the other eight modules don't each reinvent it
// slightly differently.
//
// scopedBrandIds (from rbac.middleware.js's requirePermission, via
// req.auth.scopedBrandIds) is null for a company-wide grant (Company Admin,
// HR Manager, or an Employee holding the equivalent company-wide Power) and
// an array for a caller who only holds brand-specific grants (Brand Admin).
// Per explicit requirement, Brands are FULLY independent of each other: a
// brand-scoped caller only ever sees/writes rows that are their own Brand's
// — a company-wide row (brandId null, e.g. anything created before this
// dimension existed) is invisible to them too, not a shared fallback. Only
// a company-wide caller (Company Admin/HR Manager/Group Admin) sees
// everything, across every Brand and every company-wide row, for overall
// oversight.

// create: explicit brandId (already validated against scopedBrandIds by
// rbac.middleware.js's requirePermission, which 403s a request naming a
// brandId outside the caller's grants before this ever runs) wins; a
// brand-scoped caller who simply omitted brandId still only ever means
// "my own brand", never a silent fall-through to company-wide — same fix
// already applied once for inviteEmployeeUser and createHoliday.
function resolveCreateBrandId({ brandId, scopedBrandIds }) {
  if (brandId) return brandId;
  return scopedBrandIds ? scopedBrandIds[0] : null;
}

async function assertBrandBelongsToCompany({ brandId, companyId }) {
  if (!brandId) return;
  const brand = await db.Brand.findOne({ where: { id: brandId, companyId } });
  if (!brand) throw new HttpError(400, 'Brand not found for this company');
}

// List scoping: an explicit brandId (already permission-checked by the
// route middleware) narrows to just that Brand's own rows. Otherwise, a
// brand-scoped caller sees ONLY their own Brand(s)' rows — never a
// company-wide (brandId null) row, full isolation between Brands; a
// company-wide caller sees everything, unfiltered.
function applyBrandListScope(where, { brandId, scopedBrandIds }) {
  const { Op } = db.Sequelize;
  if (brandId) {
    where.brandId = brandId;
    return where;
  }
  if (scopedBrandIds) {
    where.brandId = { [Op.in]: scopedBrandIds };
  }
  return where;
}

// Write-side guard (update/delete): a brand-scoped caller may only touch a
// row whose own brandId is one of theirs. A company-wide row (brandId null)
// is deliberately out of reach for a brand-scoped caller — editing/deleting
// it would affect every other Brand in the company too.
function assertBrandWriteScope({ scopedBrandIds, recordBrandId }) {
  if (scopedBrandIds && !scopedBrandIds.some((id) => String(id) === String(recordBrandId))) {
    throw new HttpError(403, "Record is outside caller's brand");
  }
}

// Reassigning a record's own brandId (moving it in/out of "shared", or from
// one Brand to another) is a Company/Group-Admin-only action — a
// brand-scoped caller (Brand Admin) can already only ever reach a record
// that's already theirs (assertBrandWriteScope above), and letting them
// additionally move it elsewhere would either be a no-op or an attempt to
// reach outside their own scope. Same "reject the whole attempt outright"
// shape as employee.service.js::transferEmployee's brandId-change guard.
function assertBrandReassignAllowed({ scopedBrandIds, brandIdProvided }) {
  if (scopedBrandIds && brandIdProvided) {
    throw new HttpError(403, "Brand-scoped callers cannot change a record's brand");
  }
}

// --- Payroll-specific helpers ---
// Shared by the Payroll module's employee-scoped tables (salary structures,
// payroll adjustments, payslips) — none of which carry their own brand_id
// (see CLAUDE.md: payroll tables are company_id + employee_id only), so
// brand scoping is enforced by resolving the target row's owning employee
// and checking *that* employee's brandId against the caller's
// scopedBrandIds. Mirrors employee.service.js::getEmployeeForWrite's shape
// — 404, not 403, so a Brand Admin probing another brand's employee/record
// ids can't distinguish "not found" from "not yours".
async function assertEmployeeInBrandScope({ employeeId, companyId, scopedBrandIds }) {
  if (!scopedBrandIds) return; // company-wide grant, nothing to restrict
  const employee = await db.Employee.findOne({ where: { id: employeeId, companyId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (!scopedBrandIds.some((brandId) => String(brandId) === String(employee.brandId))) {
    throw new HttpError(404, 'Employee not found');
  }
}

// For list endpoints: resolves the caller's scopedBrandIds into the set of
// employee ids they're allowed to see within companyId. Returns null when
// unrestricted (company-wide grant) so callers can tell "no filter needed"
// apart from "filter to zero employees".
async function resolveScopedEmployeeIds({ companyId, scopedBrandIds }) {
  if (!scopedBrandIds) return null;
  const employees = await db.Employee.findAll({
    where: { companyId, brandId: scopedBrandIds },
    attributes: ['id'],
  });
  return employees.map((e) => e.id);
}

module.exports = {
  resolveCreateBrandId,
  assertBrandBelongsToCompany,
  applyBrandListScope,
  assertBrandWriteScope,
  assertBrandReassignAllowed,
  assertEmployeeInBrandScope,
  resolveScopedEmployeeIds,
};

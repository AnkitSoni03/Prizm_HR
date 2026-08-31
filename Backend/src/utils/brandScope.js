'use strict';

const { HttpError } = require('./errors');
const db = require('../models');

// Shared by the Payroll module's employee-scoped tables (salary structures,
// payroll adjustments, payslips) — none of which carry their own brand_id
// (see CLAUDE.md: payroll tables are company_id + employee_id only), so
// brand scoping is enforced by resolving the target row's owning employee
// and checking *that* employee's brandId against the caller's
// scopedBrandIds (rbac.middleware.js's requirePermission output: null for a
// company-wide grant, an array of brand ids for a brand-scoped grant like
// Brand Admin). Mirrors employee.service.js::getEmployeeForWrite's shape —
// 404, not 403, so a Brand Admin probing another brand's employee/record
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

module.exports = { assertEmployeeInBrandScope, resolveScopedEmployeeIds };

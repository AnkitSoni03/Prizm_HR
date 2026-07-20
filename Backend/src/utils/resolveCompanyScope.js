'use strict';

const { HttpError } = require('./errors');
const db = require('../models');

// A company-scoped caller (Company Admin, HR Manager, etc.) is always
// scoped to their own company — authCompanyId always wins, so a scoped
// caller can never act on another company by supplying an override. Super
// Admin has no company of their own (authCompanyId is null), so only for
// Super Admin does the override (an explicit companyId from the request
// body/query) get used. Extracted after the same inline fix
// (`req.auth.companyId ?? req.body/query.companyId`) was repeated across
// Brand/Shift/ShiftRoster/Employee/Department/Designation, to keep future
// modules (Payroll, Recruitment, Performance, ...) from reinventing — or
// forgetting — it.
function resolveCompanyScope({ authCompanyId, override }) {
  return authCompanyId ?? (override || null);
}

// Same resolution, but throws when neither resolves to anything — for
// writes (create/update/delete) where a company scope is mandatory, unlike
// list endpoints where an unscoped result (Super Admin sees everything) is
// an acceptable, deliberate default.
function requireCompanyScope({ authCompanyId, override }) {
  const companyId = resolveCompanyScope({ authCompanyId, override });
  if (!companyId) {
    throw new HttpError(400, 'companyId is required');
  }
  return companyId;
}

// Group Admin is company-less (req.auth.companyId is always null, same as
// Super Admin) but IS scoped to one group — list endpoints that accept an
// explicit companyId override (so a Group Admin can drill into one of their
// Group's Companies) must not let that override name a company outside the
// caller's own group, or a tampered query param would leak another Group's
// data. A no-op for every other role (groupId is only ever set for Group
// Admin — see auth.middleware.js's requireSuperAdmin comment).
async function assertCompanyInCallerGroup({ groupId, companyId }) {
  if (!groupId) return;
  if (!companyId) throw new HttpError(400, 'companyId is required');
  const company = await db.Company.findOne({ where: { id: companyId, groupId } });
  if (!company) throw new HttpError(403, 'Company is not in your group');
}

module.exports = { resolveCompanyScope, requireCompanyScope, assertCompanyInCallerGroup };

'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { runAsCompany } = require('../../config/tenant-context');
const { getBrandScope } = require('../../middleware/rbac.middleware');
const { HttpError } = require('../../utils/errors');

// ---------------------------------------------------------------------------
// Who can do what with payroll — three levels, each covering itself and
// everything below it:
//   group   — a Group Admin (UserRole with company_id NULL + group_id) or an
//             employee holding "Manage Payroll" at Group level (UserRole on
//             their own company with group_id set): every company and brand
//             of the Group, and can edit anything made below.
//   company — `payroll:manage` on a company-wide grant (Company Admin, HR
//             Manager, Company-level power): own company + all its brands.
//   brand   — `payroll:manage` on a brand grant (Brand Admin, Brand-level
//             power): own brand(s) only.
// `payroll:read` alone gives the same scope read-only (canManage false).
// `payroll:read_own` — every employee: their own salary.
//
// Extra items have an OWNER level (company_id / brand_id on the row, both
// NULL = Group); templates have one or more TARGETS (several companies /
// brands). Either way a caller sees their own level and the levels above it,
// edits only what lies wholly in their own level and below, and a template /
// item only ever applies to employees inside its owner / targets.
// ---------------------------------------------------------------------------

async function findManagerGrant(auth) {
  const homeCompanyId = auth.homeCompanyId || auth.companyId || null;
  const where = homeCompanyId
    ? { userId: auth.userId, companyId: homeCompanyId, groupId: { [Op.ne]: null } }
    : { userId: auth.userId, companyId: null, groupId: auth.groupId || -1 };
  return runAsCompany(null, () =>
    db.UserRole.findOne({
      where,
      include: [
        {
          model: db.Role,
          as: 'role',
          required: true,
          include: [{ model: db.Permission, as: 'permissions', where: { code: 'payroll:manage' }, required: true }],
        },
      ],
    })
  );
}

async function resolvePayrollAccess(auth) {
  const grant = await findManagerGrant(auth);
  if (grant) return { level: 'group', canManage: true, groupId: String(grant.groupId), companyId: null, scopedBrandIds: null };

  if (auth.companyId && !auth.homeCompanyId) {
    // A manage grant wins over a read one; its scope is the caller's scope.
    let canManage = true;
    let scope = await getBrandScope(auth, 'payroll:manage');
    if (!scope.allowed) {
      canManage = false;
      scope = await getBrandScope(auth, 'payroll:read');
    }
    if (scope.allowed) {
      const company = await runAsCompany(null, () => db.Company.findByPk(auth.companyId, { attributes: ['id', 'groupId'] }));
      return {
        level: scope.companyWide ? 'company' : 'brand',
        canManage,
        groupId: company && company.groupId ? String(company.groupId) : null,
        companyId: String(auth.companyId),
        scopedBrandIds: scope.companyWide ? null : scope.brandIds.map(String),
      };
    }
  }
  return null;
}

function requirePayrollView(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
  return resolvePayrollAccess(req.auth)
    .then((access) => {
      if (!access) return res.status(403).json({ error: 'Forbidden', permission: 'payroll:read' });
      req.payroll = access;
      return next();
    })
    .catch(next);
}

function requirePayrollManage(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
  return resolvePayrollAccess(req.auth)
    .then((access) => {
      if (!access || !access.canManage) return res.status(403).json({ error: 'Forbidden', permission: 'payroll:manage' });
      req.payroll = access;
      return next();
    })
    .catch(next);
}

// Employee-level filter for list queries: nothing for a Group-level caller
// (the rows' own group_id bounds it; optionally narrowed by companyId/brandId
// query), { companyId[, brandId] } for a Company / Brand-level caller.
function employeeScopeWhere(access, { companyId, brandId } = {}) {
  const where = {};
  if (access.level === 'group') {
    if (companyId) where.companyId = companyId;
  } else {
    where.companyId = access.companyId;
  }
  if (access.scopedBrandIds) {
    where.brandId = brandId && access.scopedBrandIds.includes(String(brandId)) ? brandId : { [Op.in]: access.scopedBrandIds };
  } else if (brandId) {
    where.brandId = brandId;
  }
  return where;
}

// The Group's company ids (for a manager's queries on company-keyed tables).
async function groupCompanyIds(groupId) {
  const companies = await runAsCompany(null, () => db.Company.findAll({ where: { groupId }, attributes: ['id'] }));
  return companies.map((c) => String(c.id));
}

// Employee where-clause for the caller's whole scope, Group included (for
// queries on Employee itself, which has no group_id).
async function scopedEmployeeWhere(access) {
  if (access.level === 'group') return { companyId: { [Op.in]: await groupCompanyIds(access.groupId) } };
  return employeeScopeWhere(access);
}

// Is this employee ({ companyId, brandId }) inside the caller's scope?
// Group level needs the Group's company ids (groupCompanyIds).
function employeeInScope(access, employee, companyIds = null) {
  if (!employee) return false;
  if (access.level === 'group') return !!companyIds && companyIds.includes(String(employee.companyId));
  if (String(employee.companyId) !== access.companyId) return false;
  return !access.scopedBrandIds || access.scopedBrandIds.includes(String(employee.brandId));
}

// ---- Owner level of templates / extra items --------------------------------

const isSet = (v) => v !== null && v !== undefined;

// Rows the caller can see: their own level and every level above it. A
// Brand-level caller doesn't see sibling brands' rows, nor a Company-level
// caller another company's.
function ownerVisibleWhere(access) {
  if (access.level === 'group') return { groupId: access.groupId };
  const ownRows = access.scopedBrandIds
    ? { companyId: access.companyId, brandId: { [Op.in]: access.scopedBrandIds } }
    : { companyId: access.companyId };
  return {
    groupId: access.groupId,
    [Op.or]: [{ companyId: null }, { companyId: access.companyId, brandId: null }, ownRows],
  };
}

// Can the caller change this row? Group: everything. Company: rows of their
// company (its brands' too). Brand: their own brand's rows only.
function canEditOwner(access, row) {
  if (!access.canManage) return false;
  if (access.level === 'group') return true;
  if (!isSet(row.companyId) || String(row.companyId) !== access.companyId) return false;
  if (!access.scopedBrandIds) return true;
  return isSet(row.brandId) && access.scopedBrandIds.includes(String(row.brandId));
}

// Does this template / item apply to this employee ({ companyId, brandId })?
function ownerCoversEmployee(row, employee) {
  if (!isSet(row.companyId)) return true;
  if (String(row.companyId) !== String(employee.companyId)) return false;
  if (!isSet(row.brandId)) return true;
  return String(row.brandId) === String(employee.brandId);
}

// The owner a NEW template / item gets: body.companyId / body.brandId pick a
// level at or below the caller's own (omitted = the caller's own level; a
// Brand-level caller with several brands must pick one).
async function ownerForNew(access, body = {}) {
  const pick = (v) => (isSet(v) && v !== '' ? String(v) : null);
  const wantCompany = pick(body.companyId);
  let brandId = pick(body.brandId);

  let companyId;
  if (access.level === 'group') {
    if (!wantCompany && !brandId) return { companyId: null, brandId: null };
    companyId = wantCompany;
  } else {
    if (wantCompany && wantCompany !== access.companyId) throw new HttpError(403, 'You can only manage payroll of your own company');
    companyId = access.companyId;
  }

  if (access.scopedBrandIds) {
    if (!brandId && access.scopedBrandIds.length === 1) [brandId] = access.scopedBrandIds;
    if (!brandId) throw new HttpError(400, 'Choose which of your brands this is for');
    if (!access.scopedBrandIds.includes(brandId)) throw new HttpError(403, 'You can only manage payroll of your own brand');
  }

  return runAsCompany(null, async () => {
    if (brandId) {
      const brand = await db.Brand.findByPk(brandId, { attributes: ['id', 'companyId'] });
      if (!brand || (companyId && String(brand.companyId) !== companyId)) throw new HttpError(400, 'That brand is not part of the chosen company');
      companyId = String(brand.companyId);
    }
    const company = await db.Company.findByPk(companyId, { attributes: ['id', 'groupId'] });
    if (!company || String(company.groupId) !== access.groupId) throw new HttpError(400, 'That company is not part of your Group');
    return { companyId, brandId };
  });
}

// ---- Salary template targets ------------------------------------------------
// A template is made for one or more targets [{ companyId, brandId }]
// (brandId null = that whole company); none = the whole Group. Same rules as
// a single owner, applied per target.

const targetsOf = (template) => (Array.isArray(template.targets) ? template.targets : []);

// Visible when it's a Group template or any target reaches into the
// caller's own company / brand.
function templateVisible(access, template) {
  const targets = targetsOf(template);
  if (access.level === 'group' || targets.length === 0) return true;
  return targets.some(
    (t) =>
      String(t.companyId) === access.companyId &&
      (!access.scopedBrandIds || !isSet(t.brandId) || access.scopedBrandIds.includes(String(t.brandId)))
  );
}

// Editable only when EVERY target is inside the caller's own edit scope — a
// template shared with another company (or made for the Group) belongs to
// the level above.
function templateEditable(access, template) {
  if (!access.canManage) return false;
  if (access.level === 'group') return true;
  const targets = targetsOf(template);
  return targets.length > 0 && targets.every((t) => canEditOwner(access, t));
}

function templateCovers(template, employee) {
  const targets = targetsOf(template);
  return targets.length === 0 || targets.some((t) => ownerCoversEmployee(t, employee));
}

// body.targets -> clean list (each checked like ownerForNew), or null for the
// whole Group. Empty = the caller's own level. Duplicates and brands already
// covered by a whole-company target are dropped.
async function cleanTargets(access, raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 200) throw new HttpError(400, 'Choose at most 200 companies / brands');
  const picked = [];
  for (const t of list.length > 0 ? list : [{}]) {
    // eslint-disable-next-line no-await-in-loop
    picked.push(await ownerForNew(access, t || {}));
  }
  if (picked.some((t) => !t.companyId)) return null;
  const wholeCompanies = new Set(picked.filter((t) => !t.brandId).map((t) => t.companyId));
  const seen = new Set();
  return picked.filter((t) => {
    if (t.brandId && wholeCompanies.has(t.companyId)) return false;
    const key = `${t.companyId}|${t.brandId || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---- Salary ownership --------------------------------------------------------
// A salary assignment is owned by the level that assigned it
// (owner_company_id / owner_brand_id, both NULL = Group). Only that level or
// one above it may give the employee a new salary, correct it or end it — a
// lower level asks for the employee to be released (payrollRelease.service.js).

const salaryOwner = (a) => ({ companyId: isSet(a.ownerCompanyId) ? String(a.ownerCompanyId) : null, brandId: isSet(a.ownerBrandId) ? String(a.ownerBrandId) : null });
const ownerLevelOf = (o) => (!isSet(o.companyId) ? 'group' : isSet(o.brandId) ? 'brand' : 'company');

// The owner of a salary the caller assigns: their own level.
function callerOwnerFor(access, employee) {
  if (access.level === 'group') return { companyId: null, brandId: null };
  if (access.level === 'company') return { companyId: access.companyId, brandId: null };
  return { companyId: access.companyId, brandId: isSet(employee.brandId) ? String(employee.brandId) : null };
}

// A manage-level access object standing for a company / brand level, to ask
// "could that level change this?" with the same rules (canEditOwner).
function accessForLevel(groupId, { companyId, brandId }) {
  if (!isSet(companyId)) return { level: 'group', canManage: true, groupId: String(groupId), companyId: null, scopedBrandIds: null };
  return {
    level: isSet(brandId) ? 'brand' : 'company',
    canManage: true,
    groupId: String(groupId),
    companyId: String(companyId),
    scopedBrandIds: isSet(brandId) ? [String(brandId)] : null,
  };
}

// No salary, or one the caller's level owns (or a level below it).
function canChangeSalary(access, assignment) {
  return !assignment || canEditOwner(access, salaryOwner(assignment));
}

// Every user who manages payroll for this Group (Group Admins + group-level
// power holders), each with the company their notification belongs under.
async function payrollManagerRecipients(groupId) {
  const grants = await runAsCompany(null, () =>
    db.UserRole.findAll({
      where: { groupId },
      include: [
        {
          model: db.Role,
          as: 'role',
          required: true,
          include: [{ model: db.Permission, as: 'permissions', where: { code: 'payroll:manage' }, required: true }],
        },
      ],
    })
  );
  const byUser = new Map();
  for (const g of grants) if (!byUser.has(String(g.userId))) byUser.set(String(g.userId), g.companyId);
  return [...byUser.entries()].map(([userId, companyId]) => ({ userId, companyId }));
}

// Payroll managers of one owner level: the Group's (payrollManagerRecipients)
// for a Group owner, else those holding payroll:manage company-wide in that
// company (plus that brand's, for a Brand owner). None at that level → the
// Group's, who can always act.
async function ownerManagerRecipients(groupId, owner) {
  if (!isSet(owner.companyId)) return payrollManagerRecipients(groupId);
  const brandScopes = [{ brandId: null }];
  if (isSet(owner.brandId)) brandScopes.push({ brandId: owner.brandId });
  const grants = await runAsCompany(null, () =>
    db.UserRole.findAll({
      where: { companyId: owner.companyId, groupId: null, [Op.or]: brandScopes },
      include: [
        {
          model: db.Role,
          as: 'role',
          required: true,
          include: [{ model: db.Permission, as: 'permissions', where: { code: 'payroll:manage' }, required: true }],
        },
      ],
    })
  );
  const userIds = [...new Set(grants.map((g) => String(g.userId)))];
  if (userIds.length === 0) return payrollManagerRecipients(groupId);
  return userIds.map((userId) => ({ userId, companyId: owner.companyId }));
}

module.exports = {
  resolvePayrollAccess,
  requirePayrollView,
  requirePayrollManage,
  employeeScopeWhere,
  scopedEmployeeWhere,
  employeeInScope,
  ownerVisibleWhere,
  canEditOwner,
  ownerCoversEmployee,
  ownerForNew,
  templateVisible,
  templateEditable,
  templateCovers,
  cleanTargets,
  groupCompanyIds,
  payrollManagerRecipients,
  ownerManagerRecipients,
  salaryOwner,
  ownerLevelOf,
  callerOwnerFor,
  accessForLevel,
  canChangeSalary,
};

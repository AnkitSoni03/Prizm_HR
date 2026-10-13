'use strict';

const { Op } = require('sequelize');
const db = require('../../models');
const { runAsCompany } = require('../../config/tenant-context');
const { getBrandScope } = require('../../middleware/rbac.middleware');

// ---------------------------------------------------------------------------
// Who can do what with group-level payroll:
//   manage — a Group Admin (UserRole with company_id NULL + group_id) or an
//            employee holding the "Manage Payroll" power at Group level
//            (UserRole on their own company with group_id set). Both are
//            `payroll:manage` on a group-scoped grant; a company- or
//            brand-level grant of it never counts.
//   view   — Company Admin / HR Manager / Brand Admin (`payroll:read`):
//            read-only, their own company (Brand Admin: own brands only).
//   own    — every employee (`payroll:read_own`): their own salary.
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
  if (grant) return { canManage: true, groupId: String(grant.groupId), companyId: null, scopedBrandIds: null };

  if (auth.companyId && !auth.homeCompanyId) {
    const scope = await getBrandScope(auth, 'payroll:read');
    if (scope.allowed) {
      const company = await runAsCompany(null, () => db.Company.findByPk(auth.companyId, { attributes: ['id', 'groupId'] }));
      return {
        canManage: false,
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

// Employee-level filter for a viewer: { groupId } for a manager (optionally
// narrowed by companyId/brandId query), { companyId[, brandId] } otherwise.
// Returns a where-clause for Employee, or null when the caller can see
// nothing at all (a company with no Group).
function employeeScopeWhere(access, { companyId, brandId } = {}) {
  const where = {};
  if (access.canManage) {
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

module.exports = {
  resolvePayrollAccess,
  requirePayrollView,
  requirePayrollManage,
  employeeScopeWhere,
  groupCompanyIds,
  payrollManagerRecipients,
};

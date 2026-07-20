'use strict';

const { Op } = require('sequelize');
const { UserRole, Role, Permission } = require('../models');

// Checks user_roles -> role -> permissions for `code`, scoped to the caller's
// own company_id and, when brandId is given, either brand-wide (brand_id
// NULL) or matching-brand grants. Exported standalone so routes needing
// "full access OR own-record access" (e.g. employee:read vs
// employee:read_own) can compose it themselves instead of only getting a
// single-code allow/deny middleware.
async function userHasPermission({ userId, companyId }, code, brandId = null) {
  const where = { userId, companyId };
  if (brandId) {
    where[Op.or] = [{ brandId: null }, { brandId }];
  }

  const grant = await UserRole.findOne({
    where,
    include: [
      {
        model: Role,
        as: 'role',
        required: true,
        include: [
          {
            model: Permission,
            as: 'permissions',
            where: { code },
            required: true,
          },
        ],
      },
    ],
  });

  return !!grant;
}

// Resolves *every* brand the caller actually holds `code` for within their
// own company, instead of trusting whatever brandId the client happens to
// send. `companyWide: true` means at least one qualifying grant has
// brand_id NULL (unrestricted within the company); otherwise `brandIds`
// lists the specific brands the caller was actually assigned. This is the
// fix for a recurring gap: brandId was only ever read from
// params/body/query (never derived from the caller's own UserRole rows), so
// a brand-scoped caller who simply omitted brandId from the request bypassed
// brand scoping entirely and got company-wide access for that one call —
// hit in shift_roster update, inviteEmployeeUser, and the
// leave_request/od_request/attendance_regularization/comp_off list routes.
async function getBrandScope({ userId, companyId }, code) {
  const grants = await UserRole.findAll({
    where: { userId, companyId },
    include: [
      {
        model: Role,
        as: 'role',
        required: true,
        include: [
          {
            model: Permission,
            as: 'permissions',
            where: { code },
            required: true,
          },
        ],
      },
    ],
  });

  if (grants.length === 0) return { allowed: false, companyWide: false, brandIds: [] };

  let companyWide = false;
  const brandIds = new Set();
  for (const grant of grants) {
    if (grant.brandId === null) companyWide = true;
    else brandIds.add(grant.brandId);
  }
  return { allowed: true, companyWide, brandIds: [...brandIds] };
}

// Attaches req.auth.scopedBrandIds so downstream controllers/services can
// enforce brand scope against the *actual* target resource — null means the
// caller holds a company-wide grant (no restriction); an array means the
// caller only holds brand-specific grants and every read/write must be
// confined to those brands regardless of what the request body/query says.
function requirePermission(code) {
  return async function (req, res, next) {
    if (!req.auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const scope = await getBrandScope(req.auth, code);
      if (!scope.allowed) {
        return res.status(403).json({ error: 'Forbidden', permission: code });
      }

      if (scope.companyWide) {
        req.auth.scopedBrandIds = null;
      } else {
        req.auth.scopedBrandIds = scope.brandIds;
        const requestedBrandId = req.params.brandId || req.body?.brandId || req.query.brandId || null;
        if (
          requestedBrandId &&
          !scope.brandIds.some((brandId) => String(brandId) === String(requestedBrandId))
        ) {
          return res.status(403).json({ error: 'Forbidden', permission: code });
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requirePermission, userHasPermission, getBrandScope };

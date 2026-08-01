'use strict';

const { verifyAccessToken } = require('../utils/tokens');
const { runWithTenant } = require('../config/tenant-context');
const { isCompanyInactive } = require('../utils/companyStatus');
const { resolveEscalationContact } = require('../utils/accountEscalation');
const db = require('../models');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.auth = {
    userId: payload.sub,
    companyId: payload.companyId,
    groupId: payload.groupId ?? null,
    employeeId: payload.employeeId,
  };

  // Re-checked on every request (not just at login/refresh) so a Super
  // Admin deactivating a company, or an admin deactivating an employee's
  // login, takes effect immediately rather than waiting up to the access
  // token's ~15-minute TTL. Looked up outside runWithTenant below — no
  // tenant context is active yet, so User's tenant-scope hook is a no-op
  // and this always finds the row regardless of company_id.
  let user;
  try {
    user = await db.User.findByPk(req.auth.userId, {
      attributes: ['id', 'isActive', 'status'],
    });
  } catch (err) {
    return next(err);
  }
  if (!user || !user.isActive || user.status !== 'active') {
    // req.auth already carries employeeId/companyId/groupId from the JWT —
    // enough for resolveEscalationContact without a second User lookup.
    // (resolveEscalationContact reads `.id`, not `.userId` — req.auth uses
    // the latter to match the rest of this codebase's req.auth shape.)
    const contact = await resolveEscalationContact({
      id: req.auth.userId,
      employeeId: req.auth.employeeId,
      companyId: req.auth.companyId,
      groupId: req.auth.groupId,
    }).catch(() => 'your administrator');
    return res.status(403).json({
      error: `Your account has been deactivated. Please contact ${contact} to reactivate it.`,
      code: 'ACCOUNT_DEACTIVATED',
    });
  }

  if (req.auth.companyId) {
    let company;
    try {
      company = await db.Company.findByPk(req.auth.companyId, { attributes: ['id', 'status'] });
    } catch (err) {
      return next(err);
    }
    if (!company || isCompanyInactive(company.status)) {
      return res.status(403).json({
        error:
          "Your company's access has been deactivated by the platform administrator. Please contact the Super Admin to reactivate it.",
        code: 'COMPANY_DEACTIVATED',
      });
    }
  }

  // Everything downstream (rbac middleware, tenant-scoped model hooks) reads
  // company_id from this async context rather than from req, so it stays
  // correct even across awaited calls deeper in the request.
  runWithTenant(
    { userId: req.auth.userId, companyId: req.auth.companyId, groupId: req.auth.groupId },
    () => next()
  );
}

// Super Admin is the only role whose users row has BOTH company_id and
// group_id NULL (it sits above the Group/Company hierarchy) — a Group Admin
// also has company_id NULL (they're scoped by group_id instead), so both
// columns must be checked, not just company_id. Endpoints scoped to Super
// Admin only (e.g. inviting a Company's first admin) must check this
// structurally, not just via a permission code — a Company Admin can
// legitimately hold generic permissions like `user:invite` for their own
// company without that granting cross-tenant actions reserved for Super Admin.
function requireSuperAdmin(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.auth.companyId !== null || req.auth.groupId !== null) {
    return res.status(403).json({ error: 'Forbidden: Super Admin only' });
  }
  next();
}

module.exports = { requireAuth, requireSuperAdmin };

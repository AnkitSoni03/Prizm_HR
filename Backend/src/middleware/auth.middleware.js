'use strict';

const { verifyAccessToken } = require('../utils/tokens');
const { runWithTenant } = require('../config/tenant-context');

function requireAuth(req, res, next) {
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

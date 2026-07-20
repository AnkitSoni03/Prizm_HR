'use strict';

const { Router } = require('express');
const controller = require('./leaveRequest.controller');
const service = require('./leaveRequest.service');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission, userHasPermission, getBrandScope } = require('../../middleware/rbac.middleware');
const { getDirectReportEmployeeIds } = require('../../utils/managerScope');

const router = Router();
router.use(requireAuth);

// getBrandScope (not a raw client-supplied brandId) decides the caller's
// real read scope — omitting brandId from the query used to fall through to
// company-wide access for a Brand Admin who only holds a brand-scoped
// leave_request:read grant (see rbac.middleware.js's requirePermission for
// the same fix applied to the generic single-permission-code routes).
//
// `?scope=reports` and `?scope=company` are explicit opt-ins the frontend's
// Team Approvals page sends — neither is ever the default for a plain
// `GET /leave/requests` call. This matters now that an Employee can hold
// company-wide leave_request:read via the "Approve Leave/OD Requests" power
// (see powerCatalog.js) in *addition* to their base role's read_own: the
// default (no scope param) case below deliberately checks read_own first
// and returns early when held, so that caller's own "My Leave" page
// (MyLeavePage.tsx, no scope param) always sees only their own requests —
// never silently upgraded to the company-wide view just because they also
// hold the broader grant. `?scope=company` is how the Team Approvals page's
// company-wide tab deliberately asks for that broader view instead.
async function requireReadAccess(req, res, next) {
  try {
    const requestedScope = req.query.scope;

    if (requestedScope === 'reports') {
      if (await userHasPermission(req.auth, 'leave_request:read_reports') && req.auth.employeeId != null) {
        req.leaveRequestEmployeeScope = await getDirectReportEmployeeIds({
          companyId: req.auth.companyId,
          managerEmployeeId: req.auth.employeeId,
        });
        return next();
      }
      return res.status(403).json({ error: 'Forbidden', permission: 'leave_request:read_reports' });
    }

    if (
      requestedScope !== 'company' &&
      (await userHasPermission(req.auth, 'leave_request:read_own')) &&
      req.auth.employeeId != null
    ) {
      req.leaveRequestEmployeeScope = req.auth.employeeId;
      return next();
    }

    const scope = await getBrandScope(req.auth, 'leave_request:read');
    if (scope.allowed) {
      const requestedBrandId = req.query.brandId || null;
      if (
        !scope.companyWide &&
        requestedBrandId &&
        !scope.brandIds.some((brandId) => String(brandId) === String(requestedBrandId))
      ) {
        return res.status(403).json({ error: 'Forbidden', permission: 'leave_request:read' });
      }
      req.leaveRequestEmployeeScope = null;
      req.leaveRequestBrandScope = scope.companyWide ? requestedBrandId : scope.brandIds;
      return next();
    }

    return res.status(403).json({ error: 'Forbidden', permission: 'leave_request:read' });
  } catch (err) {
    next(err);
  }
}

// A manager (any Employee referenced by another employee's managerId — not
// a distinct RBAC role) may approve/reject their own direct report's leave
// request without holding the company/brand-wide leave_request:approve or
// :reject grant. The target request's own employee.managerId is the source
// of truth (loaded fresh here, not trusted from the client), same shape as
// employee.routes.js's requireEmployeeReadAccess comparing req.params.id
// against req.auth.employeeId for employee:read_own.
function requireDecisionAccess(action) {
  return async function (req, res, next) {
    try {
      if (await userHasPermission(req.auth, `leave_request:${action}`)) return next();

      if (
        (await userHasPermission(req.auth, `leave_request:${action}_reports`)) &&
        req.auth.employeeId != null
      ) {
        const request = await service.getLeaveRequestForDecision({
          companyId: req.auth.companyId,
          id: req.params.id,
        });
        if (String(request.employee.managerId) === String(req.auth.employeeId)) {
          return next();
        }
      }

      return res.status(403).json({ error: 'Forbidden', permission: `leave_request:${action}` });
    } catch (err) {
      next(err);
    }
  };
}

router.get('/', requireReadAccess, controller.list);
router.post('/', requirePermission('leave_request:create'), controller.create);
router.get('/:id/history', controller.history);
router.patch('/:id/approve', requireDecisionAccess('approve'), controller.approve);
router.patch('/:id/reject', requireDecisionAccess('reject'), controller.reject);
router.patch('/:id/cancel', requirePermission('leave_request:cancel'), controller.cancel);

module.exports = router;

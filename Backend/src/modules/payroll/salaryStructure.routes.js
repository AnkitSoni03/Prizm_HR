'use strict';

const { Router } = require('express');
const controller = require('./salaryStructure.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/employee/:employeeId', requirePermission('salary_structure:read'), controller.listForEmployee);
router.get('/employee/:employeeId/active', requirePermission('salary_structure:read'), controller.getActiveForEmployee);
router.get('/:id', requirePermission('salary_structure:read'), controller.get);
// A single endpoint handles both an employee's first-ever assignment and a
// later revision (which supersedes the current active structure rather than
// mutating it) — see assignSalaryStructure. Gated on salary_structure:create
// only; salary_structure:update exists in the permission catalog for
// symmetry with other modules but isn't independently enforced here since
// every role that holds either code holds both.
router.post('/', requirePermission('salary_structure:create'), controller.assign);

module.exports = router;

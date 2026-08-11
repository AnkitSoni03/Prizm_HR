'use strict';

const { Router } = require('express');
const controller = require('./employeeShift.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

// Mounted at /attendance/employee-shifts — separate from
// employeeShift.routes.js (mounted per-employee at
// /attendance/employees/:employeeId/shifts), since assigning the same shift
// to several employees at once doesn't fit that single-employeeId URL shape.
const router = Router();
router.use(requireAuth);

router.post('/bulk', requirePermission('employee_shift:create'), controller.bulkCreate);

module.exports = router;

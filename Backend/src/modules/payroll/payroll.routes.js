'use strict';

const express = require('express');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const { requirePayrollView, requirePayrollManage } = require('./payrollAccess');
const c = require('./payroll.controller');

// Group-level payroll. Managers (Group Admin / group-level "Manage Payroll"
// power) change things; Company/Brand Admins only read (payrollAccess.js).
// /payroll/me/* is every employee's own salary (payroll:read_own).
const router = express.Router();
router.use(requireAuth);

// ---- Employee's own salary ----
router.get('/me', requirePermission('payroll:read_own'), c.mySalary);
router.get('/me/months/:id', requirePermission('payroll:read_own'), c.myPayroll);
router.get('/me/months/:id/pdf', requirePermission('payroll:read_own'), c.myPayrollPdf);
router.get('/me/payslip-requests', requirePermission('payroll:read_own'), c.myPayslipRequests);
router.post('/me/payslip-requests', requirePermission('payroll:read_own'), c.createMyPayslipRequest);
router.patch('/me/payslip-requests/:id/cancel', requirePermission('payroll:read_own'), c.cancelMyPayslipRequest);

// ---- Shared read access ----
router.get('/access', requirePayrollView, c.access);
router.get('/companies', requirePayrollView, c.companies);
router.get('/templates', requirePayrollView, c.listTemplates);
router.get('/custom-items', requirePayrollView, c.listCustomItems);
router.get('/assignments', requirePayrollView, c.listAssignments);
router.get('/assignments/employee/:employeeId', requirePayrollView, c.employeeHistory);
router.get('/months', requirePayrollView, c.listPayrolls);
router.get('/months/:id', requirePayrollView, c.getPayroll);
router.get('/months/:id/pdf', requirePayrollView, c.payrollPdf);
router.post('/preview', requirePayrollView, c.preview);

// ---- Managers only ----
router.get('/templates/defaults', requirePayrollManage, c.templateDefaults);
router.post('/templates', requirePayrollManage, c.createTemplate);
router.put('/templates/:id', requirePayrollManage, c.updateTemplate);
router.delete('/templates/:id', requirePayrollManage, c.deleteTemplate);
router.post('/custom-items', requirePayrollManage, c.createCustomItem);
router.put('/custom-items/:id', requirePayrollManage, c.updateCustomItem);
router.delete('/custom-items/:id', requirePayrollManage, c.deleteCustomItem);
router.get('/employees', requirePayrollManage, c.groupEmployees);
router.post('/assignments', requirePayrollManage, c.assign);
router.put('/assignments/:id', requirePayrollManage, c.updateAssignment);
router.post('/assignments/:id/end', requirePayrollManage, c.endAssignment);
router.post('/months/generate', requirePayrollManage, c.generate);
router.post('/months/:id/recalculate', requirePayrollManage, c.recalculate);
router.get('/payslip-requests', requirePayrollManage, c.listPayslipRequests);
router.patch('/payslip-requests/:id/decision', requirePayrollManage, c.decidePayslipRequest);

module.exports = router;

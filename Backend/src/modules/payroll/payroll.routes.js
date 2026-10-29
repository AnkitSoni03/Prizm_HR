'use strict';

const express = require('express');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const { requirePayrollView, requirePayrollManage } = require('./payrollAccess');
const c = require('./payroll.controller');

// Payroll at three levels (payrollAccess.js): Group (Group Admin / Group-level
// "Manage Payroll" power) → every company; Company (Company Admin, HR Manager,
// Company-level power) → own company + its brands; Brand (Brand Admin,
// Brand-level power) → own brand. Each service call is bounded by the
// caller's level. /payroll/me/* is every employee's own salary (payroll:read_own).
const router = express.Router();
router.use(requireAuth);

// ---- Employee's own salary ----
router.get('/me', requirePermission('payroll:read_own'), c.mySalary);
router.get('/me/months/:id', requirePermission('payroll:read_own'), c.myPayroll);
router.get('/me/months/:id/pdf', requirePermission('payroll:read_own'), c.myPayrollPdf);

// ---- Shared read access ----
router.get('/access', requirePayrollView, c.access);
router.get('/companies', requirePayrollView, c.companies);
router.get('/templates', requirePayrollView, c.listTemplates);
router.get('/custom-items', requirePayrollView, c.listCustomItems);
router.get('/custom-items/:id/employees', requirePayrollView, c.customItemEmployees);
router.get('/assignments', requirePayrollView, c.listAssignments);
router.get('/assignments/employee/:employeeId', requirePayrollView, c.employeeHistory);
router.get('/months', requirePayrollView, c.listPayrolls);
router.get('/months/:id', requirePayrollView, c.getPayroll);
router.get('/months/:id/pdf', requirePayrollView, c.payrollPdf);
router.get('/bonuses', requirePayrollView, c.listBonuses);
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
router.post('/assignments/bulk', requirePayrollManage, c.bulkAssign);
router.put('/assignments/:id', requirePayrollManage, c.updateAssignment);
router.post('/assignments/:id/end', requirePayrollManage, c.endAssignment);
router.get('/releases', requirePayrollManage, c.listReleases);
router.get('/releases/count', requirePayrollView, c.releaseCount);
router.post('/releases', requirePayrollManage, c.requestRelease);
router.post('/releases/cancel', requirePayrollManage, c.cancelRelease);
router.post('/releases/decide', requirePayrollManage, c.decideRelease);
router.post('/releases/direct', requirePayrollManage, c.releaseDirect);
router.post('/bonuses', requirePayrollManage, c.createBonus);
router.put('/bonuses/:id', requirePayrollManage, c.updateBonus);
router.delete('/bonuses/:id', requirePayrollManage, c.deleteBonus);
router.post('/months/generate', requirePayrollManage, c.generate);
router.post('/months/:id/recalculate', requirePayrollManage, c.recalculate);
router.post('/months/share', requirePayrollManage, c.share);
router.post('/months/lock', requirePayrollManage, c.lock);

module.exports = router;

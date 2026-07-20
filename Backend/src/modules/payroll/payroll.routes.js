'use strict';

const { Router } = require('express');
const payrollSettingsRoutes = require('./payrollSettings.routes');
const salaryComponentRoutes = require('./salaryComponent.routes');
const salaryStructureRoutes = require('./salaryStructure.routes');
const payrollAdjustmentRoutes = require('./payrollAdjustment.routes');
const payrollRunRoutes = require('./payrollRun.routes');
const payslipRoutes = require('./payslip.routes');

const router = Router();

router.use('/settings', payrollSettingsRoutes);
router.use('/components', salaryComponentRoutes);
router.use('/structures', salaryStructureRoutes);
router.use('/adjustments', payrollAdjustmentRoutes);
router.use('/runs', payrollRunRoutes);
router.use('/payslips', payslipRoutes);

module.exports = router;

'use strict';

const { Router } = require('express');
const brandRoutes = require('./brand.routes');
const departmentRoutes = require('./department.routes');
const designationRoutes = require('./designation.routes');
const employeeRoutes = require('./employee.routes');
const companyPolicyRoutes = require('./companyPolicy.routes');

const router = Router();

router.use('/brands', brandRoutes);
router.use('/departments', departmentRoutes);
router.use('/designations', designationRoutes);
router.use('/employees', employeeRoutes);
router.use('/company-policies', companyPolicyRoutes);

module.exports = router;

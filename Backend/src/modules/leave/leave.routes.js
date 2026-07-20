'use strict';

const { Router } = require('express');
const leaveTypeRoutes = require('./leaveType.routes');
const leavePolicyRoutes = require('./leavePolicy.routes');
const leaveBalanceRoutes = require('./leaveBalance.routes');
const leaveRequestRoutes = require('./leaveRequest.routes');
const compOffRoutes = require('./compOff.routes');
const holidayRoutes = require('./holiday.routes');

const router = Router();

router.use('/types', leaveTypeRoutes);
router.use('/policies', leavePolicyRoutes);
router.use('/balances', leaveBalanceRoutes);
router.use('/requests', leaveRequestRoutes);
router.use('/comp-off', compOffRoutes);
router.use('/holidays', holidayRoutes);

module.exports = router;

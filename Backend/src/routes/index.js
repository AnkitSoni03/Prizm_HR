'use strict';

const { Router } = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const tenancyRoutes = require('../modules/tenancy/tenancy.routes');
const orgRoutes = require('../modules/org/org.routes');
const attendanceRoutes = require('../modules/attendance/attendance.routes');
const leaveRoutes = require('../modules/leave/leave.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
const powerRoutes = require('../modules/powers/power.routes');
const notificationRoutes = require('../modules/notifications/notification.routes');
const payrollRoutes = require('../modules/payroll/payroll.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use(tenancyRoutes);
router.use(orgRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leave', leaveRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/powers', powerRoutes);
router.use('/notifications', notificationRoutes);
router.use('/payroll', payrollRoutes);

module.exports = router;

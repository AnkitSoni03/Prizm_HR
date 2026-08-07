'use strict';

const { Router } = require('express');
const shiftRoutes = require('./shift.routes');
const shiftRosterRoutes = require('./shiftRoster.routes');
const employeeShiftRoutes = require('./employeeShift.routes');
const attendanceRegularizationRoutes = require('./attendanceRegularization.routes');
const odRequestRoutes = require('./odRequest.routes');
const attendanceCoreRoutes = require('./attendanceCore.routes');
const officeKioskRoutes = require('./officeKiosk.routes');
const faceProfileRoutes = require('./faceProfile.routes');
const faceAttendanceRoutes = require('./faceAttendance.routes');
const faceFlagRoutes = require('./faceFlag.routes');

const router = Router();

router.use('/shifts', shiftRoutes);
router.use('/rosters', shiftRosterRoutes);
router.use('/employees/:employeeId/shifts', employeeShiftRoutes);
router.use('/regularizations', attendanceRegularizationRoutes);
router.use('/od-requests', odRequestRoutes);
router.use('/face-profile', faceProfileRoutes);
router.use('/face-checkin', faceAttendanceRoutes);
router.use('/face-flags', faceFlagRoutes);
// Office kiosk routes (face-capture upload, scanner-accounts) before
// attendanceCoreRoutes — attendanceCoreRoutes' GET /:id would otherwise
// swallow e.g. GET /attendance/scanner-accounts by treating
// "scanner-accounts" as the :id param.
router.use('/', officeKioskRoutes);
// Core attendance (list, get, video-url) last so it doesn't shadow the more
// specific sub-paths above.
router.use('/', attendanceCoreRoutes);

module.exports = router;

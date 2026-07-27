'use strict';

const { Router } = require('express');
const shiftRoutes = require('./shift.routes');
const shiftRosterRoutes = require('./shiftRoster.routes');
const qrTerminalRoutes = require('./qrTerminal.routes');
const employeeShiftRoutes = require('./employeeShift.routes');
const employeeDeviceRoutes = require('./employeeDevice.routes');
const attendanceRegularizationRoutes = require('./attendanceRegularization.routes');
const odRequestRoutes = require('./odRequest.routes');
const attendanceCoreRoutes = require('./attendanceCore.routes');
const officeKioskRoutes = require('./officeKiosk.routes');

const router = Router();

router.use('/shifts', shiftRoutes);
router.use('/rosters', shiftRosterRoutes);
router.use('/terminals', qrTerminalRoutes);
router.use('/employees/:employeeId/shifts', employeeShiftRoutes);
router.use('/employees/:employeeId/devices', employeeDeviceRoutes);
router.use('/regularizations', attendanceRegularizationRoutes);
router.use('/od-requests', odRequestRoutes);
// Office kiosk routes (office-token, verify-office-*, scanner-accounts, ...)
// before attendanceCoreRoutes — attendanceCoreRoutes' GET /:id would
// otherwise swallow e.g. GET /attendance/scanner-accounts by treating
// "scanner-accounts" as the :id param.
router.use('/', officeKioskRoutes);
// Core attendance (checkin, list, get) last so it doesn't shadow the more
// specific sub-paths above.
router.use('/', attendanceCoreRoutes);

module.exports = router;

'use strict';

require('dotenv').config({ quiet: true });
const cron = require('node-cron');
const app = require('./app');
const db = require('./models');
const { runLeaveAccrual } = require('./jobs/leaveAccrual.job');
const { runWeekOffLeaveAccrual } = require('./jobs/weekOffLeaveAccrual.job');
const { sweepExpiredCompOff } = require('./jobs/compOffExpiry.job');
const { cleanupExpiredAttendanceVideos } = require('./jobs/attendanceVideoCleanup.job');
const { sendHolidayReminders } = require('./jobs/holidayReminder.job');
const { sendRosterExpiryReminders } = require('./jobs/rosterExpiryReminder.job');
const { markMissedCheckouts } = require('./jobs/missedCheckout.job');
const { sendProbationReminders } = require('./jobs/probationReminder.job');
const { verifyMailerConnection } = require('./utils/mailer');

const PORT = process.env.PORT || 5000;

// Plain node-cron schedules, in-process (no separate worker process exists
// yet in this codebase — see CLAUDE.md's Phase-4 notes). These jobs are
// simple time-based sweeps with no need for a Redis-backed queue (no retry/
// backoff/concurrency requirements) — previously ran on Bull, which kept two
// idle Redis polling timers running permanently per CLAUDE.md's Redis-usage
// audit (2026-07-10); Redis is now reserved for the face-recognition
// embedding cache and the face check-in flow only.
function startLeaveJobs() {
  cron.schedule('0 0 1 * *', () => {
    runLeaveAccrual().catch((err) => console.error('leave-accrual job failed:', err));
  });
  cron.schedule('0 0 1 * *', () => {
    runWeekOffLeaveAccrual().catch((err) => console.error('week-off-leave-accrual job failed:', err));
  });
  cron.schedule('0 0 * * *', () => {
    sweepExpiredCompOff().catch((err) => console.error('comp-off-expiry job failed:', err));
  });
  // Clean up attendance capture clips past the 90-day retention window.
  cron.schedule('0 2 * * *', () => {
    cleanupExpiredAttendanceVideos().catch((err) => console.error('attendance-video-cleanup job failed:', err));
  });
  // "Remind employees a day ahead" — holidays only ever store a date (no
  // time), so a fixed daily run checking for tomorrow's date is the correct
  // interpretation of a 24-hour-ahead reminder here.
  cron.schedule('0 9 * * *', () => {
    sendHolidayReminders().catch((err) => console.error('holiday-reminder job failed:', err));
  });
  // Roster validity reminders (see roster_groups.validity_value/unit) —
  // advisory-only, checks every active employee once a day.
  // Flag attendance rows left open past the 12h30m checkout window.
  cron.schedule('5 * * * *', () => {
    markMissedCheckouts().catch((err) => console.error('missed-checkout job failed:', err));
  });
  cron.schedule('0 9 * * *', () => {
    sendRosterExpiryReminders().catch((err) => console.error('roster-expiry-reminder job failed:', err));
  });
  // Probation/Intern period reminders — daily from 3 days before the end
  // until the Employment Type is changed (utils/probation.js).
  cron.schedule('0 9 * * *', () => {
    sendProbationReminders().catch((err) => console.error('probation-reminder job failed:', err));
  });
}

db.sequelize
  .authenticate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`HRMS backend listening on port ${PORT}`);
    });
    startLeaveJobs();
    // Catch-up on boot so a restart/deploy never skips a day's
    // Probation/Intern reminder (deduped per day, so the 9 AM run won't
    // repeat it).
    sendProbationReminders().catch((err) => console.error('probation-reminder startup run failed:', err));
    verifyMailerConnection();
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  });

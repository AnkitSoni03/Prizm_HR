'use strict';

require('dotenv').config({ quiet: true });
const cron = require('node-cron');
const app = require('./app');
const db = require('./models');
const { runLeaveAccrual } = require('./jobs/leaveAccrual.job');
const { sweepExpiredCompOff } = require('./jobs/compOffExpiry.job');

const PORT = process.env.PORT || 5000;

// Plain node-cron schedules, in-process (no separate worker process exists
// yet in this codebase — see CLAUDE.md's Phase-4 notes). These two jobs are
// simple time-based sweeps with no need for a Redis-backed queue (no retry/
// backoff/concurrency requirements) — previously ran on Bull, which kept two
// idle Redis polling timers running permanently per CLAUDE.md's Redis-usage
// audit (2026-07-10); Redis is now reserved for the QR replay-guard and
// WebAuthn challenge storage in the attendance check-in/check-out path only.
function startLeaveJobs() {
  cron.schedule('0 0 1 * *', () => {
    runLeaveAccrual().catch((err) => console.error('leave-accrual job failed:', err));
  });
  cron.schedule('0 0 * * *', () => {
    sweepExpiredCompOff().catch((err) => console.error('comp-off-expiry job failed:', err));
  });
}

db.sequelize
  .authenticate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`HRMS backend listening on port ${PORT}`);
    });
    startLeaveJobs();
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  });

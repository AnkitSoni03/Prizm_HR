'use strict';

// This deployment reasons in IST calendar days (attendance, leave, accrual —
// CLAUDE.md's "this deployment is IST") regardless of what timezone the
// server process itself happens to be running in. A developer's own machine
// is usually already IST, so plain local-time getters looked correct there,
// but Render's (and most other hosts') containers default to UTC — between
// UTC midnight and IST midnight (00:00–05:29 IST) that silently made "today"
// resolve to the *previous* calendar day, which then cascaded into date
// ranges being clipped to nothing (see attendance.service.js's
// listMyAttendanceHistory). Explicit `timeZone` below makes this correct
// regardless of the host's own ambient TZ.
const BUSINESS_TIMEZONE = 'Asia/Kolkata';

// YYYY-MM-DD in the business timezone — deliberately not toISOString() (UTC)
// or plain getFullYear()/getMonth()/getDate() (server-ambient-local), per
// the note above.
function dateOnly(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(date);
}

// Re-anchors a Date instant onto its own y/m/d/h/m/s *as seen in the
// business timezone*. After this, calling .getFullYear()/.getMonth()/
// .getDate() etc. on the result (via the server's own ambient-local getters)
// always returns the business-timezone values, regardless of what timezone
// the server process itself is actually running in. Use this before doing
// Date-object arithmetic/comparisons involving "now" — dateOnly() above is
// for when a plain YYYY-MM-DD string is all that's needed.
function toBusinessLocal(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return new Date(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return dateOnly(d);
}

// Inclusive list of YYYY-MM-DD strings from fromDate to toDate.
function datesBetween(fromDate, toDate) {
  const dates = [];
  const cursor = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  while (cursor <= end) {
    dates.push(dateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

module.exports = { addDays, datesBetween, dateOnly, toBusinessLocal };

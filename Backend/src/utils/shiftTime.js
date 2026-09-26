'use strict';

const { addDays, buildBusinessDateTime } = require('./dateRange');

// How long after a check-in the employee may still check out, for every
// shift (day or night) — shift length plus the maximum overtime this
// business allows (~12h total), plus a 30-minute buffer. Measured from the
// actual check-in instant, not the shift's scheduled start, so a late
// arrival gets the same full window. Past it the open record is left as a
// missed checkout (fixed only through an attendance regularization) and
// the employee's next punch is a fresh check-in.
const CHECKOUT_WINDOW_MINUTES = 12 * 60 + 30;
const CHECKOUT_WINDOW_MS = CHECKOUT_WINDOW_MINUTES * 60 * 1000;

// "HH:MM" or "HH:MM:SS" -> "HH:MM" (Postgres TIME columns come back with
// seconds; <input type="time"> sends without).
function toHHMM(time) {
  return typeof time === 'string' ? time.slice(0, 5) : null;
}

// A shift whose end time is at or before its start time ends on the next
// calendar day (e.g. 21:00–06:00). Derived from the times themselves rather
// than trusted from a client-supplied flag, so the stored is_night_shift can
// never disagree with the shift's actual hours.
function crossesMidnight(startTime, endTime) {
  const start = toHHMM(startTime);
  const end = toHHMM(endTime);
  if (!start || !end) return false;
  return end <= start;
}

function isOvernightShift(shift) {
  return !!shift && (shift.isNightShift || crossesMidnight(shift.startTime, shift.endTime));
}

// The instant a shift worked on `businessDate` is scheduled to end — the
// next calendar day for an overnight shift.
function scheduledEndDateTime(businessDate, shift) {
  if (!shift || !shift.endTime) return null;
  const endDateStr = isOvernightShift(shift) ? addDays(businessDate, 1) : businessDate;
  return buildBusinessDateTime(endDateStr, toHHMM(shift.endTime));
}

// A check-in/out that's still open, and whose checkout window has passed.
function isCheckoutWindowOver(checkIn, now = new Date()) {
  return !!checkIn && now - new Date(checkIn) > CHECKOUT_WINDOW_MS;
}

// Read-side view of "Missed Checkout": the persisted flag (set by the
// hourly job / a rejected late checkout) OR — so it shows the moment the
// window passes, not up to an hour later — computed live from the times.
function isCheckoutMissed(attendance, now = new Date()) {
  if (!attendance || !attendance.checkIn || attendance.checkOut) return false;
  return !!attendance.checkoutMissed || isCheckoutWindowOver(attendance.checkIn, now);
}

// A regularization's requested check-out time is entered as a plain "HH:MM"
// against the attendance date. For an overnight shift that time is on the
// next calendar day — so if it would otherwise land at or before the
// check-in, roll it forward one day.
function resolveCheckOutDateTime(dateStr, checkOutTime, checkIn) {
  const sameDay = buildBusinessDateTime(dateStr, checkOutTime);
  if (!sameDay || !checkIn) return sameDay;
  return sameDay <= new Date(checkIn) ? buildBusinessDateTime(addDays(dateStr, 1), checkOutTime) : sameDay;
}

module.exports = {
  CHECKOUT_WINDOW_MINUTES,
  CHECKOUT_WINDOW_MS,
  crossesMidnight,
  isOvernightShift,
  scheduledEndDateTime,
  isCheckoutWindowOver,
  isCheckoutMissed,
  resolveCheckOutDateTime,
};

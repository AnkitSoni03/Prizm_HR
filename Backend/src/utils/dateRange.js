'use strict';

// Local-time YYYY-MM-DD — deliberately not toISOString() (UTC), same
// rationale as attendance.service.js's dateOnly(): on a server running
// ahead of UTC (e.g. IST), toISOString() silently rolls a local date back
// by one calendar day.
function dateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

module.exports = { addDays, datesBetween, dateOnly };

'use strict';

const { dateOnly } = require('./dateRange');

// Real calendar-month arithmetic (not a flat 30-day approximation) — a
// 6-month Roster assigned Feb 1 expires Aug 1, not Feb 1 + 182 days.
// null whenever any input is missing (no validity configured, or the
// employee has no assignment date at all).
function computeRosterExpiry({ assignedAt, validityValue, validityUnit }) {
  if (!assignedAt || !validityValue || !validityUnit) return null;

  const date = new Date(`${assignedAt}T00:00:00`);
  if (validityUnit === 'months') {
    date.setMonth(date.getMonth() + Number(validityValue));
  } else {
    date.setDate(date.getDate() + Number(validityValue));
  }
  return dateOnly(date);
}

// Whole calendar days from "today" (business-local) to dateStr — negative
// once dateStr is in the past.
function daysUntil(dateStr, asOf = new Date()) {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date(`${dateOnly(asOf)}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

module.exports = { computeRosterExpiry, daysUntil };

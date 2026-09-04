// Backend date-only fields come back as plain "YYYY-MM-DD" strings (see
// dateRange.js's local Y-M-D convention) — parsed directly rather than via
// `new Date(str)`, which would interpret them as UTC midnight and can roll
// back a day once rendered in a local timezone ahead of UTC (e.g. IST).
export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return '—';
  const datePart = value.length > 10 ? value.slice(0, 10) : value;
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

// "DD/MM/YYYY – DD/MM/YYYY" for a date range (e.g. a multi-day holiday) —
// always shows both ends, even when they're the same day, so every row in a
// list reads consistently rather than sometimes being a single date and
// sometimes a range.
export function formatDisplayDateRange(from: string | null | undefined, to: string | null | undefined): string {
  return `${formatDisplayDate(from)} – ${formatDisplayDate(to ?? from)}`;
}

// Inclusive day count between two "YYYY-MM-DD" strings (e.g. a holiday's
// date..endDate) — parsed as local midnight, same convention as the rest of
// this file, so this can't be thrown off by DST or a UTC-vs-local mismatch.
export function countDaysInclusive(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

// Whole calendar days from today to a "YYYY-MM-DD" date (negative if it's
// already past) — parsed as local midnight, same convention as the rest of
// this file. Used to flag a comp-off credit as "expiring soon" so an
// employee/admin can see it needs using before it's wasted.
export function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// "HH:MM" (24h, browser-local — matches the business timezone for the
// deployment's actual users) from a full ISO datetime, e.g. an
// AttendanceRegularization's requestedCheckIn/requestedCheckOut.
export function formatDisplayTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Same "HH:MM" shape but '' (not '—') when unset, matching what an
// `<input type="time">` needs as its `value` to prefill correctly.
export function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDisplayDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

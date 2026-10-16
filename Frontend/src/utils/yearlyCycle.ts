import { formatDisplayDate } from './dateDisplay';

// "Yearly Roster Update" — the month a yearly leave cycle starts on.
// Mirrors Backend/src/utils/leavePeriod.js (month 1-12, day 1).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

// "Jan – Dec", "Apr – Mar".
export function yearlyCycleLabel(startMonth: number): string {
  const end = (startMonth + 10) % 12;
  return `${SHORT[startMonth - 1]} – ${SHORT[end]}`;
}

export const YEARLY_CYCLE_OPTIONS = MONTHS.map((_, i) => ({
  value: String(i + 1),
  label: yearlyCycleLabel(i + 1),
}));

// YYYY-MM-DD + n days (local dates, no UTC shift).
export function addDaysToDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// "10/10/2026 – ongoing" / "08/04/2027 – 31/12/2027" for a year-grain
// leave balance row (null for a monthly-reset row — its month is the period).
export function balancePeriodLabel(row: { month: number | null; periodStart?: string; periodEnd?: string | null }): string | null {
  if (row.month || !row.periodStart) return null;
  return `${formatDisplayDate(row.periodStart)} – ${row.periodEnd ? formatDisplayDate(row.periodEnd) : 'ongoing'}`;
}

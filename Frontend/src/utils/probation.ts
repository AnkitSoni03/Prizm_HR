// Mirrors Backend/src/utils/probation.js — keep the two in step.

// sessionStorage key prefix for "pop-up already shown this login" —
// cleared on logout (AuthContext) so ProbationReminderModal shows again on
// every login.
export const PROBATION_POPUP_KEY_PREFIX = 'hrms:probationPopupShown:';

export type ProbationPeriodUnit = 'days' | 'months';

// Last day of the period. Days: DOJ counted as day 1 (DOJ 2026-01-01 + 180
// days → 2026-06-29). Months: always a month's last day — joined on/before
// the 15th, the joining month is month 1 (DOJ 10 Mar + 6 → 31 Aug); joined
// after the 15th, counting starts next month (DOJ 20 Mar + 6 → 30 Sep).
// null when either input is missing/invalid.
export function probationEndDate(
  dateOfJoining: string,
  periodDays: string | number | null | undefined,
  unit: ProbationPeriodUnit = 'days'
): string | null {
  const amount = Number(periodDays);
  if (!dateOfJoining || !Number.isInteger(amount) || amount < 1) return null;
  let date = new Date(`${dateOfJoining}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (unit === 'months') {
    const months = amount + (date.getDate() > 15 ? 1 : 0);
    // Day 0 of a month = last day of the month before it.
    date = new Date(date.getFullYear(), date.getMonth() + months, 0);
  } else {
    date.setDate(date.getDate() + amount - 1);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function describeRemaining(daysRemaining: number): string {
  if (daysRemaining > 1) return `Ends in ${daysRemaining} days`;
  if (daysRemaining === 1) return 'Ends tomorrow';
  if (daysRemaining === 0) return 'Ends today';
  if (daysRemaining === -1) return 'Ended yesterday';
  return `Ended ${-daysRemaining} days ago`;
}

export function periodLabel(employmentType: string): string {
  return employmentType === 'intern' ? 'Internship period' : 'Probation period';
}

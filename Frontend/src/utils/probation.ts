// Mirrors Backend/src/utils/probation.js — keep the two in step.

// sessionStorage key prefix for "pop-up already shown this login" —
// cleared on logout (AuthContext) so ProbationReminderModal shows again on
// every login.
export const PROBATION_POPUP_KEY_PREFIX = 'hrms:probationPopupShown:';

export type ProbationPeriodUnit = 'days' | 'months';

// Last day of the period, DOJ counted as day 1 (DOJ 2026-01-01 + 180 days →
// 2026-06-29; DOJ 2026-10-10 + 6 months → 2027-04-09). Months clamp to the
// target month's last day. null when either input is missing/invalid.
export function probationEndDate(
  dateOfJoining: string,
  periodDays: string | number | null | undefined,
  unit: ProbationPeriodUnit = 'days'
): string | null {
  const amount = Number(periodDays);
  if (!dateOfJoining || !Number.isInteger(amount) || amount < 1) return null;
  const date = new Date(`${dateOfJoining}T00:00:00`);
  if (unit === 'months') {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + amount);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay) - 1);
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

// Mirrors Backend/src/utils/probation.js — keep the two in step.

// sessionStorage key prefix for "pop-up already shown this login" —
// cleared on logout (AuthContext) so ProbationReminderModal shows again on
// every login.
export const PROBATION_POPUP_KEY_PREFIX = 'hrms:probationPopupShown:';

// Last day of the period, DOJ counted as day 1 (DOJ 2026-01-01 + 180 days →
// 2026-06-29). null when either input is missing/invalid.
export function probationEndDate(dateOfJoining: string, periodDays: string | number | null | undefined): string | null {
  const days = Number(periodDays);
  if (!dateOfJoining || !Number.isInteger(days) || days < 1) return null;
  const date = new Date(`${dateOfJoining}T00:00:00`);
  date.setDate(date.getDate() + days - 1);
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

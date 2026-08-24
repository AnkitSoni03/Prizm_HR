// Mirrors Backend/src/utils/rosterValidity.js exactly — real calendar-month
// arithmetic (not a flat 30-day approximation), computed client-side purely
// for display so no extra round trip is needed to show "Expires in N days".
export type ValidityUnit = 'days' | 'months';

export function computeRosterExpiry(
  assignedAt: string | null,
  validityValue: number | null,
  validityUnit: ValidityUnit | null
): string | null {
  if (!assignedAt || !validityValue || !validityUnit) return null;

  const date = new Date(`${assignedAt}T00:00:00`);
  if (validityUnit === 'months') {
    date.setMonth(date.getMonth() + validityValue);
  } else {
    date.setDate(date.getDate() + validityValue);
  }
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD, local
}

export function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date(new Date().toLocaleDateString('en-CA') + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function rosterExpiryLabel(remaining: number): string {
  if (remaining < 0) return `Expired ${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? '' : 's'} ago`;
  if (remaining === 0) return 'Expires today';
  if (remaining === 1) return 'Expires in 1 day';
  return `Expires in ${remaining} days`;
}

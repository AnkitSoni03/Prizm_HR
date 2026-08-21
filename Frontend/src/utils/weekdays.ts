// Same 3-letter convention as company-admin/components/ShiftFormModal.tsx's
// WEEKDAYS options — JS's Date#getDay() index (0 = Sunday .. 6 = Saturday).
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Formats a Shift's weeklyOffDays (e.g. [2, 3]) as "Tue, Wed" for display on
// a profile/detail page — used anywhere a resolved shift needs to show its
// week-off days without duplicating this array + sort + join per page.
export function weeklyOffLabel(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return '—';
  return [...days].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(', ');
}

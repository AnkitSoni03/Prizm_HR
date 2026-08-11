import type { ShiftRoster } from '../api/tenancy';

export interface RosterGroup {
  key: string;
  rosterDate: string;
  shiftId: string;
  brandId: string | null;
  entries: ShiftRoster[];
}

// Collapses individual per-employee roster rows that share the same
// date+shift(+brand) into a single group — the Rosters table shows one row
// per group instead of one row per employee, since each shift_rosters row is
// really just one employee's slot within what an admin thinks of as "one
// roster" for that day.
export function groupRosters(rosters: ShiftRoster[]): RosterGroup[] {
  const groups = new Map<string, RosterGroup>();
  for (const roster of rosters) {
    const key = `${roster.rosterDate}|${roster.shiftId}|${roster.brandId ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(roster);
    } else {
      groups.set(key, {
        key,
        rosterDate: roster.rosterDate,
        shiftId: roster.shiftId,
        brandId: roster.brandId,
        entries: [roster],
      });
    }
  }
  return [...groups.values()].sort((a, b) => (a.rosterDate < b.rosterDate ? 1 : a.rosterDate > b.rosterDate ? -1 : 0));
}

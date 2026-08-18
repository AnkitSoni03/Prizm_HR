import type { RosterPolicyGroup } from '../../api/companyAdmin/rosterGroups';

interface RosterMultiSelectProps {
  label?: string;
  rosterGroups: RosterPolicyGroup[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

// Checkbox list of every Roster in the company — used on Shift/Holiday/
// Company Policy/Leave Policy's own create/edit forms ("Assign to
// Roster(s)"). Roster is the sole determinant of visibility now — leaving
// every box unchecked means nobody sees this yet (it's just a catalog entry
// until attached to at least one Roster); checking one or more makes it
// visible to exactly those Rosters' employees.
export function RosterMultiSelect({
  label = 'Assign to Roster(s)',
  rosterGroups,
  selectedIds,
  onChange,
}: RosterMultiSelectProps) {
  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-sm font-medium text-ink">{label}</label>
        <span className="text-xs text-ink-muted">
          {selectedIds.length === 0 ? 'Not visible to anyone yet' : `${selectedIds.length} selected`}
        </span>
      </div>
      {rosterGroups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-ink-muted">
          No Rosters created yet — create one first, then assign it here so employees can actually see this.
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-card">
          {rosterGroups.map((rosterGroup) => (
            <label
              key={rosterGroup.id}
              className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm text-ink last:border-b-0 hover:bg-page"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(rosterGroup.id)}
                onChange={() => toggle(rosterGroup.id)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
              />
              <span>{rosterGroup.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { RosterMultiSelect } from '../../../components/ui/RosterMultiSelect';
import { createShift, updateShift } from '../../../api/companyAdmin/attendance';
import { listRosterGroups, type RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';
import type { Shift } from '../../../api/tenancy';

interface ShiftFormModalProps {
  shift?: Shift;
  shifts: Shift[];
  // Pre-selects these Rosters on the first row — used when this modal is
  // opened from inside a Roster's own detail view ("Add Shift" right there),
  // so the admin doesn't have to re-pick the Roster they were just looking
  // at. Ignored when editing an existing shift (its own rosterGroups win).
  defaultRosterGroupIds?: string[];
  onClose: () => void;
  onSaved: () => void;
}

interface ShiftRow {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  weeklyOffDays: number[];
  // Only meaningful when weeklyOffDays is empty — see
  // shift.service.js::normalizeWeekOffLeaveConfig, which discards both
  // otherwise.
  weekOffLeaveEnabled: boolean;
  weekOffLeaveBasisDays: number[];
  rosterGroupIds: string[];
}

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

function blankRow(id: number): ShiftRow {
  return {
    id,
    name: '',
    startTime: '09:00',
    endTime: '18:00',
    weeklyOffDays: [],
    weekOffLeaveEnabled: false,
    weekOffLeaveBasisDays: [],
    rosterGroupIds: [],
  };
}

// Rough "≈ N/month" hint shown next to the basis-day picker — counts
// occurrences of the selected weekday(s) in the CURRENT calendar month, just
// to give the admin a feel for the resulting quota size (the real quota is
// computed server-side, per-month, by computeWeekOffQuota).
function estimateMonthlyCount(basisDays: number[]): number {
  if (basisDays.length === 0) return 0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daySet = new Set(basisDays);
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (daySet.has(new Date(now.getFullYear(), now.getMonth(), day).getDay())) count += 1;
  }
  return count;
}

// Surfaces the backend's specific message (e.g. the 409 "Roster ... already
// has a different Shift assigned" conflict) instead of a generic fallback.
function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

// Two shifts sharing the same start/end time is fine (e.g. two differently-
// named shifts covering the same hours for different teams) — only the name
// has to be unique per company, case-insensitively. Flags a row matching an
// already-saved shift's name (excluding the one being edited) and two rows
// in this submission matching each other's name.
function findNameConflicts(rows: ShiftRow[], existingShifts: Shift[]): string[] {
  const messages: string[] = [];
  const norm = (name: string) => name.trim().toLowerCase();

  for (const row of rows) {
    const match = existingShifts.find((s) => norm(s.name) === norm(row.name));
    if (match) {
      messages.push(`A shift named "${row.name}" already exists.`);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (norm(rows[i].name) === norm(rows[j].name)) {
        messages.push(`"${rows[i].name}" is used for more than one shift here — names must be unique.`);
      }
    }
  }

  return messages;
}

export function ShiftFormModal({ shift, shifts, defaultRosterGroupIds, onClose, onSaved }: ShiftFormModalProps) {
  const isEdit = !!shift;
  const [rows, setRows] = useState<ShiftRow[]>([
    shift
      ? {
          id: 0,
          name: shift.name,
          startTime: shift.startTime.slice(0, 5),
          endTime: shift.endTime.slice(0, 5),
          weeklyOffDays: shift.weeklyOffDays,
          weekOffLeaveEnabled: shift.weekOffLeaveEnabled ?? false,
          weekOffLeaveBasisDays: shift.weekOffLeaveBasisDays ?? [],
          rosterGroupIds: shift.rosterGroups?.map((rg) => rg.id) ?? [],
        }
      : { ...blankRow(0), rosterGroupIds: defaultRosterGroupIds ?? [] },
  ]);
  const [nextRowId, setNextRowId] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: string[]; failed: string[] } | null>(null);
  const [rosterGroups, setRosterGroups] = useState<RosterPolicyGroup[]>([]);

  useEffect(() => {
    listRosterGroups()
      .then(setRosterGroups)
      .catch(() => setRosterGroups([]));
  }, []);

  function addRow() {
    setRows((prev) => [...prev, blankRow(nextRowId)]);
    setNextRowId((id) => id + 1);
  }

  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  }

  function updateRow(id: number, patch: Partial<Omit<ShiftRow, 'id'>>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function toggleDay(rowId: number, day: number) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const weeklyOffDays = row.weeklyOffDays.includes(day)
          ? row.weeklyOffDays.filter((d) => d !== day)
          : [...row.weeklyOffDays, day].sort((a, b) => a - b);
        // Picking a real weekly-off day makes the whole Week Off Leave
        // choice moot again — reset it so re-clearing weeklyOffDays later
        // doesn't silently resurface a stale Yes/basis-days choice.
        return weeklyOffDays.length > 0
          ? { ...row, weeklyOffDays, weekOffLeaveEnabled: false, weekOffLeaveBasisDays: [] }
          : { ...row, weeklyOffDays };
      })
    );
  }

  function toggleBasisDay(rowId: number, day: number) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              weekOffLeaveBasisDays: row.weekOffLeaveBasisDays.includes(day)
                ? row.weekOffLeaveBasisDays.filter((d) => d !== day)
                : [...row.weekOffLeaveBasisDays, day].sort((a, b) => a - b),
            }
          : row
      )
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (rows.some((row) => !row.name.trim())) {
      setError('Enter a name for every shift.');
      return;
    }

    const existingForComparison = shifts.filter((s) => s.id !== shift?.id);
    const conflicts = findNameConflicts(rows, existingForComparison);
    if (conflicts.length > 0) {
      setError(`Can't save — ${conflicts.join(' ')}`);
      return;
    }

    const unresolvedWeekOff = rows.find(
      (row) => row.weeklyOffDays.length === 0 && row.weekOffLeaveEnabled && row.weekOffLeaveBasisDays.length === 0
    );
    if (unresolvedWeekOff) {
      setError(`"${unresolvedWeekOff.name}": pick at least one day for Week Off Leave, or turn it off.`);
      return;
    }

    if (isEdit) {
      setIsSubmitting(true);
      try {
        const row = rows[0];
        await updateShift(shift.id, {
          name: row.name,
          startTime: row.startTime,
          endTime: row.endTime,
          isNightShift: false,
          weeklyOffDays: row.weeklyOffDays,
          weekOffLeaveEnabled: row.weekOffLeaveEnabled,
          weekOffLeaveBasisDays: row.weekOffLeaveBasisDays,
          rosterGroupIds: row.rosterGroupIds,
        });
        onSaved();
        onClose();
      } catch (err) {
        setError(extractErrorMessage(err, 'Could not update the shift. Please try again.'));
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    if (rows.length === 1) {
      try {
        const row = rows[0];
        await createShift({
          name: row.name,
          startTime: row.startTime,
          endTime: row.endTime,
          isNightShift: false,
          weeklyOffDays: row.weeklyOffDays,
          weekOffLeaveEnabled: row.weekOffLeaveEnabled,
          weekOffLeaveBasisDays: row.weekOffLeaveBasisDays,
          rosterGroupIds: row.rosterGroupIds,
        });
        onSaved();
        onClose();
      } catch (err) {
        setError(extractErrorMessage(err, 'Could not create the shift. Please try again.'));
        setIsSubmitting(false);
      }
      return;
    }

    const results = await Promise.allSettled(
      rows.map((row) =>
        createShift({
          name: row.name,
          startTime: row.startTime,
          endTime: row.endTime,
          isNightShift: false,
          weeklyOffDays: row.weeklyOffDays,
          weekOffLeaveEnabled: row.weekOffLeaveEnabled,
          weekOffLeaveBasisDays: row.weekOffLeaveBasisDays,
          rosterGroupIds: row.rosterGroupIds,
        })
      )
    );
    const created = rows.filter((_, i) => results[i].status === 'fulfilled').map((r) => r.name);
    const failed = rows.filter((_, i) => results[i].status === 'rejected').map((r) => r.name);
    onSaved();
    setIsSubmitting(false);
    setSummary({ created, failed });
  }

  if (summary) {
    return (
      <Modal title="Shifts created" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={1.5} />
          <p className="text-sm text-ink">
            Created {summary.created.length} of {summary.created.length + summary.failed.length} shifts.
          </p>
          {summary.failed.length > 0 && (
            <p className="text-sm text-danger">Failed: {summary.failed.join(', ')}</p>
          )}
          <Button className="mt-2" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={isEdit ? 'Edit Shift' : 'Create Shift'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="space-y-3 rounded-xl border border-border p-3">
              {!isEdit && (
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Shift {index + 1}
                  </p>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      aria-label={`Remove shift ${index + 1}`}
                      className="rounded-md p-1 text-ink-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              )}
              <Input
                id={`shift-name-${row.id}`}
                label="Name"
                required
                value={row.name}
                onChange={(event) => updateRow(row.id, { name: event.target.value })}
                placeholder="Morning Shift"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id={`shift-start-${row.id}`}
                  label="Start Time"
                  type="time"
                  required
                  value={row.startTime}
                  onChange={(event) => updateRow(row.id, { startTime: event.target.value })}
                />
                <Input
                  id={`shift-end-${row.id}`}
                  label="End Time"
                  type="time"
                  required
                  value={row.endTime}
                  onChange={(event) => updateRow(row.id, { endTime: event.target.value })}
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Weekly Off Days</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(row.id, day.value)}
                      className={[
                        'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                        row.weeklyOffDays.includes(day.value)
                          ? 'border-primary bg-primary-light text-primary'
                          : 'border-border text-ink-muted hover:bg-page',
                      ].join(' ')}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
              {row.weeklyOffDays.length === 0 && (
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary-light/40 p-3">
                  <div>
                    <p className="text-sm font-medium text-ink">This shift has no fixed weekly off.</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Should employees on this shift still get a "Week Off Leave" balance instead?
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateRow(row.id, { weekOffLeaveEnabled: true })}
                      className={[
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        row.weekOffLeaveEnabled
                          ? 'border-primary bg-primary text-white'
                          : 'border-border bg-card text-ink-muted hover:bg-page',
                      ].join(' ')}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRow(row.id, { weekOffLeaveEnabled: false, weekOffLeaveBasisDays: [] })}
                      className={[
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        !row.weekOffLeaveEnabled
                          ? 'border-primary bg-primary text-white'
                          : 'border-border bg-card text-ink-muted hover:bg-page',
                      ].join(' ')}
                    >
                      No
                    </button>
                  </div>

                  {row.weekOffLeaveEnabled && (
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-ink">
                        Which day(s) count toward the monthly balance?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleBasisDay(row.id, day.value)}
                            className={[
                              'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                              row.weekOffLeaveBasisDays.includes(day.value)
                                ? 'border-primary bg-primary-light text-primary'
                                : 'border-border text-ink-muted hover:bg-page',
                            ].join(' ')}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                      {row.weekOffLeaveBasisDays.length > 0 && (
                        <p className="mt-1.5 text-xs text-ink-muted">
                          ≈ {estimateMonthlyCount(row.weekOffLeaveBasisDays)} leave(s) this month.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <RosterMultiSelect
                rosterGroups={rosterGroups}
                selectedIds={row.rosterGroupIds}
                onChange={(ids) => updateRow(row.id, { rosterGroupIds: ids })}
              />
            </div>
          ))}

          {!isEdit && (
            <Button type="button" variant="secondary" onClick={addRow} className="w-full">
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              Add Another Shift
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? 'Save Changes' : rows.length > 1 ? `Create ${rows.length} Shifts` : 'Create Shift'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

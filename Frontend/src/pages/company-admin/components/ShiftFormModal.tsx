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
  onClose: () => void;
  onSaved: () => void;
}

interface ShiftRow {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  weeklyOffDays: number[];
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
  return { id, name: '', startTime: '09:00', endTime: '18:00', weeklyOffDays: [], rosterGroupIds: [] };
}

// Surfaces the backend's specific message (e.g. the 409 "Roster ... already
// has a different Shift assigned" conflict) instead of a generic fallback.
function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

// Flags two kinds of same-time collisions: a row matching an already-saved
// shift (excluding the one being edited), and two rows in this submission
// matching each other — both mean "don't create a second shift for a time
// slot that already exists under a different name."
function findTimeConflicts(rows: ShiftRow[], existingShifts: Shift[]): string[] {
  const messages: string[] = [];

  for (const row of rows) {
    const match = existingShifts.find(
      (s) => s.startTime.slice(0, 5) === row.startTime && s.endTime.slice(0, 5) === row.endTime
    );
    if (match) {
      messages.push(
        `"${row.name || 'Untitled'}" (${row.startTime}–${row.endTime}) is the same time as the existing shift "${match.name}".`
      );
    }
  }

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].startTime === rows[j].startTime && rows[i].endTime === rows[j].endTime) {
        messages.push(
          `"${rows[i].name || 'Untitled'}" and "${rows[j].name || 'Untitled'}" both use ${rows[i].startTime}–${rows[i].endTime}.`
        );
      }
    }
  }

  return messages;
}

export function ShiftFormModal({ shift, shifts, onClose, onSaved }: ShiftFormModalProps) {
  const isEdit = !!shift;
  const [rows, setRows] = useState<ShiftRow[]>([
    shift
      ? {
          id: 0,
          name: shift.name,
          startTime: shift.startTime.slice(0, 5),
          endTime: shift.endTime.slice(0, 5),
          weeklyOffDays: shift.weeklyOffDays,
          rosterGroupIds: shift.rosterGroups?.map((rg) => rg.id) ?? [],
        }
      : blankRow(0),
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
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              weeklyOffDays: row.weeklyOffDays.includes(day)
                ? row.weeklyOffDays.filter((d) => d !== day)
                : [...row.weeklyOffDays, day].sort((a, b) => a - b),
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
    const conflicts = findTimeConflicts(rows, existingForComparison);
    if (conflicts.length > 0) {
      setError(`Can't save — a shift with the same time already exists: ${conflicts.join(' ')}`);
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

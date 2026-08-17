import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { deleteShift, listShifts } from '../../api/companyAdmin/attendance';
import type { Shift } from '../../api/tenancy';
import { ShiftFormModal } from '../company-admin/components/ShiftFormModal';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Shifts get the same create/update/delete UI Company Admin has (Brand
// Admin was granted shift:create/update/delete alongside employee/
// department/designation write access — see
// 20260713100000-seed-brand-admin-full-power-permissions.js). Shift
// definitions are still company-wide (no brand_id column exists on
// `shifts`), so a Shift a Brand Admin creates/edits here is visible
// company-wide, same as one Company Admin creates.
//
// Per-date shift_rosters management (the old "Rosters" tab) was removed
// from this page — it lived here alongside Shifts before the "Roster"
// feature existed and read confusingly like the same thing. shift_rosters
// itself is untouched on the backend (still the highest-priority source for
// resolveShiftForDate, CLAUDE.md rule 7); it's just no longer managed from
// this admin UI.
export function ShiftsRostersPage() {
  const { user, hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const brandId = user?.roles.find((role) => role.name === 'Brand Admin')?.brandId ?? null;

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | 'new' | null>(null);

  async function loadShifts() {
    try {
      setShifts(await listShifts());
    } catch {
      setError('Could not load shifts.');
    }
  }

  async function handleDeleteShift(shift: Shift) {
    const confirmed = await confirm({
      title: 'Delete shift',
      message: `Delete shift "${shift.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteShift(shift.id);
      loadShifts();
    } catch {
      showToast('Could not delete this shift — it may still be in use by an employee shift or roster.');
    }
  }

  useEffect(() => {
    if (!brandId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('No Brand is linked to this account.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    listShifts()
      .then(setShifts)
      .catch(() => setError('Could not load shifts.'))
      .finally(() => setIsLoading(false));
  }, [brandId]);

  return (
    <div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {hasPermission('shift:create') && (
        <div className="mb-3 flex justify-end">
          <Button variant="secondary" onClick={() => setEditingShift('new')}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Add Shift
          </Button>
        </div>
      )}
      <Table
        isLoading={isLoading}
        rows={shifts}
        rowKey={(shift) => shift.id}
        columns={[
          {
            key: 'name',
            header: 'Name',
            render: (shift) => (
              <span className="font-medium text-ink">
                {shift.name}
                {shift.isNightShift && <span className="ml-2 text-xs font-normal text-ink-muted">(night)</span>}
              </span>
            ),
          },
          {
            key: 'hours',
            header: 'Hours',
            render: (shift) => `${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)}`,
          },
          {
            key: 'weeklyOff',
            header: 'Weekly Off',
            render: (shift) =>
              shift.weeklyOffDays.length > 0
                ? shift.weeklyOffDays.map((d) => WEEKDAY_LABELS[d]).join(', ')
                : '—',
          },
          {
            key: 'actions',
            header: '',
            className: 'w-24 text-right',
            render: (shift) =>
              (hasPermission('shift:update') || hasPermission('shift:delete')) && (
                <div className="flex justify-end gap-1">
                  {hasPermission('shift:update') && (
                    <button
                      type="button"
                      onClick={() => setEditingShift(shift)}
                      aria-label={`Edit ${shift.name}`}
                      className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                  {hasPermission('shift:delete') && (
                    <button
                      type="button"
                      onClick={() => handleDeleteShift(shift)}
                      aria-label={`Delete ${shift.name}`}
                      className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              ),
          },
        ]}
      />

      {editingShift && (
        <ShiftFormModal
          shift={editingShift === 'new' ? undefined : editingShift}
          shifts={shifts}
          onClose={() => setEditingShift(null)}
          onSaved={loadShifts}
        />
      )}
    </div>
  );
}

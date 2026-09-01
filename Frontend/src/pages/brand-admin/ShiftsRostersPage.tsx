import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Moon, Pencil, Plus, Sun, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { DetailRow } from '../../components/ui/DetailRow';
import { SearchInput } from '../../components/ui/SearchInput';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { deleteShift, listShifts } from '../../api/companyAdmin/attendance';
import type { Shift } from '../../api/tenancy';
import { ShiftFormModal } from '../company-admin/components/ShiftFormModal';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHours(shift: Shift) {
  return `${shift.startTime.slice(0, 5)} – ${shift.endTime.slice(0, 5)}`;
}

function formatDuration(shift: Shift) {
  const [sh, sm] = shift.startTime.split(':').map(Number);
  const [eh, em] = shift.endTime.split(':').map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60; // overnight shift
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function ShiftCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="mt-4 space-y-2.5 border-t border-border pt-3.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </>
  );
}

interface ShiftCardProps {
  shift: Shift;
  onEdit?: () => void;
  onDelete?: () => void;
}

function ShiftCard({ shift, onEdit, onDelete }: ShiftCardProps) {
  const Icon = shift.isNightShift ? Moon : Sun;
  const weeklyOff =
    shift.weeklyOffDays.length > 0 ? shift.weeklyOffDays.map((d) => WEEKDAY_LABELS[d]).join(', ') : '—';

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <Badge tone={shift.isNightShift ? 'neutral' : 'warning'}>{shift.isNightShift ? 'Night' : 'Day'}</Badge>
          <p className="mt-1 truncate text-[15px] font-semibold text-ink">{shift.name}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow
          icon={Clock}
          label="Hours"
          value={
            <span className="inline-flex items-center gap-2">
              {formatHours(shift)}
              <span className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-semibold text-primary">
                {formatDuration(shift)}
              </span>
            </span>
          }
        />
        <DetailRow icon={CalendarDays} label="Weekly Off" value={weeklyOff} />
      </div>

      {(onEdit || onDelete) && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${shift.name}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-page hover:text-ink"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${shift.name}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'day' | 'night'>('');

  const canCreate = hasPermission('shift:create');
  const canUpdate = hasPermission('shift:update');
  const canDelete = hasPermission('shift:delete');

  async function loadShifts() {
    try {
      setShifts(await listShifts());
    } catch {
      setError('Could not load shifts.');
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

  const filteredShifts = useMemo(
    () =>
      shifts.filter(
        (shift) =>
          (!search.trim() || shift.name.toLowerCase().includes(search.trim().toLowerCase())) &&
          (typeFilter === '' || (typeFilter === 'night') === shift.isNightShift),
      ),
    [shifts, search, typeFilter],
  );

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

  return (
    <div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2.5 sm:flex-row sm:items-center">
          <SearchInput placeholder="Search shifts…" value={search} onChange={setSearch} />
          <FilterSelect
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as typeof typeFilter)}
            placeholder="All types"
            ariaLabel="Filter by shift type"
            options={[
              { value: 'day', label: 'Day' },
              { value: 'night', label: 'Night' },
            ]}
          />
        </div>
        {canCreate && (
          <Button onClick={() => setEditingShift('new')}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Shift
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ShiftCardSkeleton />
        </div>
      )}

      {!isLoading && filteredShifts.length === 0 && (
        <EmptyStateCard
          icon={CalendarDays}
          title={shifts.length === 0 ? 'No more shifts yet!' : 'No shifts match your search'}
          description={
            shifts.length === 0
              ? 'Create shifts to organize work hours and manage schedules efficiently.'
              : 'Try a different search term or clear the type filter.'
          }
          action={
            shifts.length === 0 && canCreate ? (
              <Button onClick={() => setEditingShift('new')}>
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                Add Your First Shift
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && filteredShifts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredShifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              onEdit={canUpdate ? () => setEditingShift(shift) : undefined}
              onDelete={canDelete ? () => handleDeleteShift(shift) : undefined}
            />
          ))}
        </div>
      )}

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

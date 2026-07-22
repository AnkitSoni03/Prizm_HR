import { useEffect, useState } from 'react';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { deleteHoliday, holidayAuditName, listHolidays, type Holiday } from '../../api/companyAdmin/holidays';
import { HolidayFormModal } from '../company-admin/components/HolidayFormModal';
import { formatDisplayDate } from '../../utils/dateDisplay';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

function weekday(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
}

// Every employee can view this page (holiday:read). An HR-department
// employee additionally holds holiday:create/update/delete (auto-granted —
// see hrTeamSync.js on the backend) and gets the same Add/Edit/Delete
// controls the Company Admin Holidays page has, right here in their own
// ESS portal — there's no separate "admin" portal for an HR Team member to
// go find these in, they're still a regular employee first.
export function HolidaysPage() {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const canCreate = hasPermission('holiday:create');
  const canUpdate = hasPermission('holiday:update');
  const canDelete = hasPermission('holiday:delete');
  const canManage = canCreate || canUpdate || canDelete;

  const [year, setYear] = useState(CURRENT_YEAR);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | 'new' | null>(null);

  async function loadHolidays() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listHolidays({ from: `${year}-01-01`, to: `${year}-12-31` });
      setHolidays(result.data);
    } catch {
      setError('Could not load holidays.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  async function handleDelete(holiday: Holiday) {
    const confirmed = await confirm({
      title: 'Delete holiday',
      message: `Delete holiday "${holiday.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteHoliday(holiday.id);
      loadHolidays();
    } catch {
      showToast('Could not delete this holiday.');
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-ink-muted">Your company's yearly holiday calendar.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-32">
            <Select
              id="holiday-year"
              label="Year"
              value={String(year)}
              onChange={(event) => setYear(Number(event.target.value))}
              options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: String(y) }))}
            />
          </div>
          {canCreate && (
            <Button onClick={() => setEditingHoliday('new')}>
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              Add Holiday
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && holidays.length === 0 && (
        <EmptyStateCard
          icon={CalendarClock}
          title="No holidays listed"
          description={`No holidays have been added for ${year} yet.`}
        />
      )}

      {(isLoading || holidays.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={holidays}
          rowKey={(holiday) => holiday.id}
          columns={[
            { key: 'date', header: 'Date', render: (h) => formatDisplayDate(h.date) },
            { key: 'day', header: 'Day', render: (h) => weekday(h.date) },
            { key: 'name', header: 'Name', render: (h) => <span className="font-medium text-ink">{h.name}</span> },
            {
              key: 'type',
              header: 'Type',
              render: (h) => <Badge tone={h.type === 'public' ? 'success' : 'neutral'}>{h.type}</Badge>,
            },
            ...(canManage
              ? [
                  {
                    key: 'record',
                    header: 'Record',
                    render: (h: Holiday) => {
                      const createdByName = holidayAuditName(h.creator);
                      const updatedByName = holidayAuditName(h.updater);
                      return (
                        <div className="text-xs text-ink-muted">
                          {createdByName && <p>Created by {createdByName}</p>}
                          {updatedByName && <p>Last edited by {updatedByName}</p>}
                          {!createdByName && !updatedByName && '—'}
                        </div>
                      );
                    },
                  },
                  {
                    key: 'actions',
                    header: '',
                    className: 'w-24 text-right',
                    render: (h: Holiday) =>
                      (canUpdate || canDelete) && (
                        <div className="flex justify-end gap-1">
                          {canUpdate && (
                            <button
                              type="button"
                              onClick={() => setEditingHoliday(h)}
                              aria-label={`Edit ${h.name}`}
                              className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(h)}
                              aria-label={`Delete ${h.name}`}
                              className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                          )}
                        </div>
                      ),
                  },
                ]
              : []),
          ]}
        />
      )}

      {editingHoliday && (
        <HolidayFormModal
          holiday={editingHoliday === 'new' ? undefined : editingHoliday}
          onClose={() => setEditingHoliday(null)}
          onSaved={loadHolidays}
        />
      )}
    </div>
  );
}

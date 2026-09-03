import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { ColorTag, AccentTag } from '../../components/ColorTag';
import { HolidayCard, HolidayCardSkeleton } from '../../components/HolidayCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { deleteHoliday, holidayAuditName, listHolidays, type Holiday } from '../../api/companyAdmin/holidays';
import { HolidayFormModal } from './components/HolidayFormModal';
import { countDaysInclusive, formatDisplayDateRange } from '../../utils/dateDisplay';

export function HolidaysPage() {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const canCreate = hasPermission('holiday:create');
  const canUpdate = hasPermission('holiday:update');
  const canDelete = hasPermission('holiday:delete');

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | 'new' | null>(null);
  const [search, setSearch] = useState('');

  async function loadHolidays() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listHolidays();
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
  }, []);

  const filteredHolidays = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return holidays;
    return holidays.filter((h) => h.name.toLowerCase().includes(needle));
  }, [holidays, search]);

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
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <CalendarClock className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm text-ink-muted">
            {holidays.length > 0 && (
              <span className="font-medium text-ink">
                {holidays.length} holiday{holidays.length === 1 ? '' : 's'} —{' '}
              </span>
            )}
            only shown to the Roster(s) each is assigned to on an employee's "Yearly Holidays" page.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setEditingHoliday('new')} className="shrink-0">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Holiday
          </Button>
        )}
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search holidays…" value={search} onChange={setSearch} />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && filteredHolidays.length === 0 && (
        <EmptyStateCard
          icon={CalendarClock}
          title={holidays.length === 0 ? 'No holidays yet' : 'No holidays match your search'}
          description={
            holidays.length === 0
              ? "Add your company's yearly holidays so employees can see them on their dashboard."
              : 'Try a different search term.'
          }
        />
      )}

      {(isLoading || filteredHolidays.length > 0) && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={filteredHolidays}
              rowKey={(holiday) => holiday.id}
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  render: (h) => <ColorTag>{h.name}</ColorTag>,
                },
                { key: 'date', header: 'Date', render: (h) => formatDisplayDateRange(h.date, h.endDate) },
                {
                  key: 'roster',
                  header: 'Applies To',
                  render: (h) =>
                    h.rosterGroups && h.rosterGroups.length > 0 ? (
                      <span className="text-ink">{h.rosterGroups.map((rg) => rg.name).join(', ')}</span>
                    ) : (
                      <span className="text-ink-muted">Not visible to anyone yet</span>
                    ),
                },
                {
                  key: 'day',
                  header: 'Days',
                  render: (h) => {
                    const count = countDaysInclusive(h.date, h.endDate);
                    return <AccentTag>{count} Day{count === 1 ? '' : 's'}</AccentTag>;
                  },
                },
                {
                  key: 'record',
                  header: 'Record',
                  render: (h) => {
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
                  render: (holiday) =>
                    (canUpdate || canDelete) && (
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => setEditingHoliday(holiday)}
                            aria-label={`Edit ${holiday.name}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(holiday)}
                            aria-label={`Delete ${holiday.name}`}
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
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <HolidayCardSkeleton />}
            {!isLoading &&
              filteredHolidays.map((holiday) => (
                <HolidayCard
                  key={holiday.id}
                  holiday={holiday}
                  showAppliesTo
                  onEdit={canUpdate ? () => setEditingHoliday(holiday) : undefined}
                  onDelete={canDelete ? () => handleDelete(holiday) : undefined}
                />
              ))}
          </div>
        </>
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

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { ColorTag, AccentTag } from '../../components/ColorTag';
import { HolidayCard, HolidayCardSkeleton } from '../../components/HolidayCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { deleteHoliday, holidayAuditName, listHolidays, type Holiday } from '../../api/companyAdmin/holidays';
import { HolidayFormModal } from '../company-admin/components/HolidayFormModal';
import { countDaysInclusive, formatDisplayDateRange } from '../../utils/dateDisplay';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

// Every employee can view this page (holiday:read). An employee additionally
// granted the "Add/Edit/Delete Yearly Holidays" Power (powerCatalog.js) holds
// holiday:create/update/delete and gets the same Add/Edit/Delete controls the
// Company Admin Holidays page has, right here in their own ESS portal —
// there's no separate "admin" portal for them to go find these in, they're
// still a regular employee first.
export function HolidaysPage() {
  const { user, hasPermission } = useAuth();
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
  const [search, setSearch] = useState('');

  async function loadHolidays() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listHolidays({
        from: `${year}-01-01`,
        to: `${year}-12-31`,
        rosterGroupId: user?.rosterGroupId ?? 'none',
      });
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
          <p className="text-sm text-ink-muted">Your company's yearly holiday calendar.</p>
        </div>
        <div className="flex shrink-0 items-end gap-3">
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

      <div className="mb-4">
        <SearchInput placeholder="Search holidays…" value={search} onChange={setSearch} />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && filteredHolidays.length === 0 && (
        <EmptyStateCard
          icon={CalendarClock}
          title={holidays.length === 0 ? 'No holidays listed' : 'No holidays match your search'}
          description={holidays.length === 0 ? `No holidays have been added for ${year} yet.` : 'Try a different search term.'}
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
                  key: 'day',
                  header: 'Days',
                  render: (h) => {
                    const count = countDaysInclusive(h.date, h.endDate);
                    return <AccentTag>{count} Day{count === 1 ? '' : 's'}</AccentTag>;
                  },
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
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <HolidayCardSkeleton />}
            {!isLoading &&
              filteredHolidays.map((holiday) => (
                <HolidayCard
                  key={holiday.id}
                  holiday={holiday}
                  showRecord={canManage}
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

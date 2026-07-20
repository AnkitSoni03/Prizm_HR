import { useEffect, useState } from 'react';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { deleteHoliday, holidayAuditName, listHolidays, type Holiday } from '../../api/companyAdmin/holidays';
import { HolidayFormModal } from './components/HolidayFormModal';
import { formatDisplayDate } from '../../utils/dateDisplay';

export function HolidaysPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('holiday:create');
  const canUpdate = hasPermission('holiday:update');
  const canDelete = hasPermission('holiday:delete');

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | 'new' | null>(null);

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

  async function handleDelete(holiday: Holiday) {
    if (!window.confirm(`Delete holiday "${holiday.name}"? This cannot be undone.`)) return;
    try {
      await deleteHoliday(holiday.id);
      loadHolidays();
    } catch {
      window.alert('Could not delete this holiday.');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          These holidays are also shown to every employee on their "Yearly Holidays" page.
        </p>
        {canCreate && (
          <Button onClick={() => setEditingHoliday('new')}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Holiday
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && holidays.length === 0 && (
        <EmptyStateCard
          icon={CalendarClock}
          title="No holidays yet"
          description="Add your company's yearly holidays so employees can see them on their dashboard."
        />
      )}

      {(isLoading || holidays.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={holidays}
          rowKey={(holiday) => holiday.id}
          columns={[
            { key: 'date', header: 'Date', render: (h) => formatDisplayDate(h.date) },
            { key: 'name', header: 'Name', render: (h) => <span className="font-medium text-ink">{h.name}</span> },
            {
              key: 'type',
              header: 'Type',
              render: (h) => <Badge tone={h.type === 'public' ? 'success' : 'neutral'}>{h.type}</Badge>,
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

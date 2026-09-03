import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowRightLeft, Hash, Pencil, Plus, RotateCw, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { DetailRow } from '../../components/ui/DetailRow';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { deleteLeaveType, listLeaveTypes, type LeaveType } from '../../api/companyAdmin/leaveBalance';
import { LeaveTypeFormModal } from './components/LeaveTypeFormModal';

const CYCLE_LABELS: Record<LeaveType['cycleType'], string> = {
  calendar: 'Calendar Year',
  anniversary: 'Anniversary (Joining Date)',
  custom: 'Custom',
};

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function cycleLabel(leaveType: LeaveType): string {
  if (leaveType.cycleType === 'custom' && leaveType.customCycleStartMonth && leaveType.customCycleStartDay) {
    return `Custom (${MONTH_NAMES[leaveType.customCycleStartMonth - 1]} ${leaveType.customCycleStartDay})`;
  }
  return CYCLE_LABELS[leaveType.cycleType];
}

function carryForwardLabel(leaveType: LeaveType): string {
  if (!leaveType.carryForward) return 'No';
  return leaveType.maxCarryForwardDays != null ? `Up to ${leaveType.maxCarryForwardDays} days` : 'Unlimited';
}

const ACCRUAL_LABELS: Record<NonNullable<LeaveType['defaultAccrual']>, string> = {
  yearly: 'Yearly',
  monthly: 'Monthly',
  monthly_reset: 'Monthly reset',
};

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

function LeaveTypeCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </>
  );
}

interface LeaveTypeCardProps {
  leaveType: LeaveType;
  onEdit?: () => void;
  onDelete?: () => void;
}

function LeaveTypeCard({ leaveType, onEdit, onDelete }: LeaveTypeCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <Wallet className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{leaveType.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
              <Hash className="h-3 w-3 shrink-0" strokeWidth={1.75} />
              {leaveType.code}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <Badge tone={leaveType.isPaid ? 'success' : 'neutral'}>{leaveType.isPaid ? 'Paid' : 'Unpaid'}</Badge>
        </div>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow icon={RotateCw} label="Cycle" value={cycleLabel(leaveType)} />
        <DetailRow icon={ArrowRightLeft} label="Carry Forward" value={carryForwardLabel(leaveType)} />
        <DetailRow
          icon={TrendingUp}
          label="Default Accrual"
          value={leaveType.defaultAccrual ? ACCRUAL_LABELS[leaveType.defaultAccrual] : '—'}
        />
      </div>

      {(onEdit || onDelete) && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${leaveType.name}`}
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
              aria-label={`Delete ${leaveType.name}`}
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

// The catalog of leave types a company offers (Sick Leave, Annual Leave,
// ...) — separate from Leave Policy Settings, which scopes a quota/accrual
// for a leave type to one or more Rosters. Create the leave type here
// first, then go configure who gets it (and how much) on the Leave Policy
// Settings page — same split the "+ Add Leave Type" shortcut inside that
// page's own Add Policy form already implies.
export function LeaveTypesPage() {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const canCreate = hasPermission('leave_type:create');
  const canUpdate = hasPermission('leave_type:update');
  const canDelete = hasPermission('leave_type:delete');

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<LeaveType | 'new' | null>(null);
  const [search, setSearch] = useState('');

  async function loadLeaveTypes() {
    setIsLoading(true);
    setError(null);
    try {
      setLeaveTypes(await listLeaveTypes());
    } catch {
      setError('Could not load leave types.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeaveTypes();
  }, []);

  const filteredLeaveTypes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return leaveTypes;
    return leaveTypes.filter((lt) => lt.name.toLowerCase().includes(needle) || lt.code.toLowerCase().includes(needle));
  }, [leaveTypes, search]);

  async function handleDelete(leaveType: LeaveType) {
    const confirmed = await confirm({
      title: 'Delete leave type',
      message: `Delete "${leaveType.name}"? This cannot be undone, and only works if no employee already has a balance or request for it.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteLeaveType(leaveType.id);
      loadLeaveTypes();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const forced = await confirm({
          title: 'Employees already have history for this leave type',
          message: `"${leaveType.name}" has existing leave balances or leave requests. Force-deleting it will permanently erase that balance/request history for every employee it applies to — this cannot be undone. Delete anyway?`,
          confirmLabel: 'Force delete',
          variant: 'danger',
        });
        if (!forced) return;
        try {
          await deleteLeaveType(leaveType.id, true);
          loadLeaveTypes();
        } catch (forceErr) {
          showToast(extractError(forceErr, 'Could not delete this leave type.'));
        }
        return;
      }
      showToast(extractError(err, 'Could not delete this leave type.'));
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <Wallet className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm text-ink-muted">
            The leave types your company offers. Set a quota and assign one to a Roster on Leave Policy
            Settings once it's here.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setEditingType('new')} className="shrink-0">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Leave Type
          </Button>
        )}
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search leave types…" value={search} onChange={setSearch} />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && filteredLeaveTypes.length === 0 && (
        <EmptyStateCard
          icon={Wallet}
          title={leaveTypes.length === 0 ? 'No leave types yet' : 'No leave types match your search'}
          description={
            leaveTypes.length === 0
              ? 'Add one to get started — e.g. "Sick Leave" or "Annual Leave".'
              : 'Try a different search term.'
          }
        />
      )}

      {(isLoading || filteredLeaveTypes.length > 0) && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={filteredLeaveTypes}
              rowKey={(lt) => lt.id}
              columns={[
                { key: 'name', header: 'Name', render: (lt) => <span className="font-medium text-ink">{lt.name}</span> },
                { key: 'code', header: 'Code', render: (lt) => lt.code },
                { key: 'paid', header: 'Paid', render: (lt) => <Badge tone={lt.isPaid ? 'success' : 'neutral'}>{lt.isPaid ? 'Paid' : 'Unpaid'}</Badge> },
                { key: 'cycle', header: 'Cycle', render: (lt) => cycleLabel(lt) },
                {
                  key: 'carryForward',
                  header: 'Carry Forward',
                  render: (lt) =>
                    lt.carryForward ? (
                      <span className="text-ink">{carryForwardLabel(lt)}</span>
                    ) : (
                      <span className="text-ink-muted">No</span>
                    ),
                },
                {
                  key: 'defaultAccrual',
                  header: 'Default Accrual',
                  render: (lt) => (lt.defaultAccrual ? ACCRUAL_LABELS[lt.defaultAccrual] : <span className="text-ink-muted">—</span>),
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-24 text-right',
                  render: (lt) =>
                    (canUpdate || canDelete) && (
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => setEditingType(lt)}
                            aria-label={`Edit ${lt.name}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(lt)}
                            aria-label={`Delete ${lt.name}`}
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
            {isLoading && <LeaveTypeCardSkeleton />}
            {!isLoading &&
              filteredLeaveTypes.map((lt) => (
                <LeaveTypeCard
                  key={lt.id}
                  leaveType={lt}
                  onEdit={canUpdate ? () => setEditingType(lt) : undefined}
                  onDelete={canDelete ? () => handleDelete(lt) : undefined}
                />
              ))}
          </div>
        </>
      )}

      {editingType && (
        <LeaveTypeFormModal
          leaveType={editingType === 'new' ? undefined : editingType}
          onClose={() => setEditingType(null)}
          onSaved={loadLeaveTypes}
        />
      )}
    </div>
  );
}

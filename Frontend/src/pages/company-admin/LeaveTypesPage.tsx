import { useEffect, useState } from 'react';
import axios from 'axios';
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { deleteLeaveType, listLeaveTypes, type LeaveType } from '../../api/companyAdmin/leaveBalance';
import { LeaveTypeFormModal } from './components/LeaveTypeFormModal';

const CYCLE_LABELS: Record<LeaveType['cycleType'], string> = {
  calendar: 'Calendar Year',
  anniversary: 'Anniversary (Joining Date)',
};

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
      showToast(extractError(err, 'Could not delete this leave type.'));
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Wallet className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
          The leave types your company offers. Set a quota and assign one to a Roster on Leave Policy
          Settings once it's here.
        </p>
        {canCreate && (
          <Button onClick={() => setEditingType('new')}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Leave Type
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && leaveTypes.length === 0 && (
        <EmptyStateCard
          icon={Wallet}
          title="No leave types yet"
          description='Add one to get started — e.g. "Sick Leave" or "Annual Leave".'
        />
      )}

      {(isLoading || leaveTypes.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={leaveTypes}
          rowKey={(lt) => lt.id}
          columns={[
            { key: 'name', header: 'Name', render: (lt) => <span className="font-medium text-ink">{lt.name}</span> },
            { key: 'code', header: 'Code', render: (lt) => lt.code },
            { key: 'paid', header: 'Paid', render: (lt) => <Badge tone={lt.isPaid ? 'success' : 'neutral'}>{lt.isPaid ? 'Paid' : 'Unpaid'}</Badge> },
            { key: 'cycle', header: 'Cycle', render: (lt) => CYCLE_LABELS[lt.cycleType] },
            {
              key: 'carryForward',
              header: 'Carry Forward',
              render: (lt) =>
                lt.carryForward ? (
                  <span className="text-ink">{lt.maxCarryForwardDays != null ? `Up to ${lt.maxCarryForwardDays} days` : 'Unlimited'}</span>
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

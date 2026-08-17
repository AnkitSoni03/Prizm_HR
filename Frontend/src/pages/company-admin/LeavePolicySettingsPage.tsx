import { useEffect, useState } from 'react';
import { ClipboardList, Pencil, Plus } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { listLeavePolicies, type LeavePolicy } from '../../api/companyAdmin/leavePolicies';
import { listLeaveTypes, type LeaveType } from '../../api/companyAdmin/leaveBalance';
import { LeavePolicyFormModal } from './components/LeavePolicyFormModal';

const ACCRUAL_LABELS: Record<LeavePolicy['accrual'], string> = {
  yearly: 'Yearly',
  monthly: 'Monthly',
  monthly_reset: 'Monthly reset',
};

// Leave policy (quota/accrual/eligibility) per leave type — previously
// API-only, no frontend page existed. This is now the single place to
// manage BOTH a leave type's company-wide default AND any Roster-specific
// overrides — a leave type can have at most one company-wide default (zero
// Rosters assigned) plus at most one override per Roster (enforced
// server-side), so "Add Policy" always stays available; a conflicting
// combination just comes back as a form error.
export function LeavePolicySettingsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('leave_policy:create');
  const canUpdate = hasPermission('leave_policy:update');

  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | 'new' | null>(null);

  async function loadPolicies() {
    try {
      setPolicies(await listLeavePolicies());
    } catch {
      setError('Could not load leave policies.');
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);
    Promise.all([listLeavePolicies(), listLeaveTypes()])
      .then(([p, lt]) => {
        setPolicies(p);
        setLeaveTypes(lt);
      })
      .catch(() => setError('Could not load leave policies.'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
          Company-wide default quota per leave type, or an override scoped to one or more Rosters.
        </p>
        {canCreate && (
          <Button onClick={() => setEditingPolicy('new')} disabled={leaveTypes.length === 0}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Policy
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && policies.length === 0 && (
        <EmptyStateCard
          icon={ClipboardList}
          title="No leave policies yet"
          description="Set an annual quota and accrual rule per leave type so employees can start applying for leave."
        />
      )}

      {(isLoading || policies.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={policies}
          rowKey={(p) => p.id}
          columns={[
            { key: 'leaveType', header: 'Leave Type', render: (p) => p.leaveType?.name ?? p.leaveTypeId },
            {
              key: 'roster',
              header: 'Applies To',
              render: (p) =>
                p.rosterGroups && p.rosterGroups.length > 0 ? (
                  <span className="text-ink">{p.rosterGroups.map((rg) => rg.name).join(', ')}</span>
                ) : (
                  <span className="text-ink-muted">Company-wide</span>
                ),
            },
            { key: 'quota', header: 'Annual Quota', render: (p) => `${p.annualQuota} days` },
            { key: 'accrual', header: 'Accrual', render: (p) => ACCRUAL_LABELS[p.accrual] },
            {
              key: 'eligibility',
              header: 'Eligible After',
              render: (p) => (p.applicableAfterDays > 0 ? `${p.applicableAfterDays} days` : 'Immediately'),
            },
            {
              key: 'actions',
              header: '',
              className: 'w-16 text-right',
              render: (p) =>
                canUpdate && (
                  <button
                    type="button"
                    onClick={() => setEditingPolicy(p)}
                    aria-label={`Edit ${p.leaveType?.name ?? 'policy'}`}
                    className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                ),
            },
          ]}
        />
      )}

      {editingPolicy && (
        <LeavePolicyFormModal
          policy={editingPolicy === 'new' ? undefined : editingPolicy}
          leaveTypes={leaveTypes}
          onClose={() => setEditingPolicy(null)}
          onSaved={loadPolicies}
        />
      )}
    </div>
  );
}

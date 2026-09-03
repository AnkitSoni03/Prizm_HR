import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, Clock, Layers, Pencil, Plus, RotateCw } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { DetailRow } from '../../components/ui/DetailRow';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { listLeavePolicies, type LeavePolicy } from '../../api/companyAdmin/leavePolicies';
import { listLeaveTypes, type LeaveType } from '../../api/companyAdmin/leaveBalance';
import { listEmployees } from '../../api/companyAdmin/employees';
import type { RosterPolicyGroup } from '../../api/companyAdmin/rosterGroups';
import type { Employee } from '../../api/tenancy';
import { LeavePolicyFormModal } from './components/LeavePolicyFormModal';
import { RosterGroupDetailModal } from './components/RosterGroupDetailModal';

const ACCRUAL_LABELS: Record<LeavePolicy['accrual'], string> = {
  yearly: 'Yearly',
  monthly: 'Monthly',
  monthly_reset: 'Monthly reset',
};

function eligibilityLabel(policy: LeavePolicy): string {
  return policy.applicableAfterDays > 0 ? `${policy.applicableAfterDays} days` : 'Immediately';
}

function RosterChips({ rosterGroups, onView }: { rosterGroups: RosterPolicyGroup[]; onView: (rg: RosterPolicyGroup) => void }) {
  if (rosterGroups.length === 0) return <span className="text-ink-muted">Not visible to anyone yet</span>;
  return (
    <span className="flex flex-wrap justify-end gap-x-1.5">
      {rosterGroups.map((rg, i) => (
        <span key={rg.id}>
          <button type="button" onClick={() => onView(rg)} className="text-primary hover:underline">
            {rg.name}
          </button>
          {i < rosterGroups.length - 1 ? ',' : ''}
        </span>
      ))}
    </span>
  );
}

function LeavePolicyCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
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

interface LeavePolicyCardProps {
  policy: LeavePolicy;
  onViewRoster: (rg: RosterPolicyGroup) => void;
  onEdit?: () => void;
}

function LeavePolicyCard({ policy, onViewRoster, onEdit }: LeavePolicyCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
          <ClipboardList className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
          {policy.leaveType?.name ?? policy.leaveTypeId}
        </p>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow icon={Layers} label="Applies To" value={<RosterChips rosterGroups={policy.rosterGroups ?? []} onView={onViewRoster} />} />
        <DetailRow icon={CalendarDays} label="Annual Quota" value={`${policy.annualQuota} days`} />
        <DetailRow icon={RotateCw} label="Accrual" value={ACCRUAL_LABELS[policy.accrual]} />
        <DetailRow icon={Clock} label="Eligible After" value={eligibilityLabel(policy)} />
      </div>

      {onEdit && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${policy.leaveType?.name ?? 'policy'}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-page hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | 'new' | null>(null);
  const [viewingRosterGroup, setViewingRosterGroup] = useState<RosterPolicyGroup | null>(null);
  const [search, setSearch] = useState('');

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
    Promise.all([listLeavePolicies(), listLeaveTypes(), listEmployees({ limit: 100 })])
      .then(([p, lt, emp]) => {
        setPolicies(p);
        setLeaveTypes(lt);
        setEmployees(emp.data);
      })
      .catch(() => setError('Could not load leave policies.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredPolicies = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return policies;
    return policies.filter((p) => (p.leaveType?.name ?? p.leaveTypeId).toLowerCase().includes(needle));
  }, [policies, search]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <ClipboardList className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm text-ink-muted">
            Every leave policy is scoped to one or more Rosters — an employee only gets a leave type once their
            Roster has a policy for it here. Click a Roster under "Applies To" to assign employees to it.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setEditingPolicy('new')} disabled={leaveTypes.length === 0} className="shrink-0">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Policy
          </Button>
        )}
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search by leave type…" value={search} onChange={setSearch} />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && filteredPolicies.length === 0 && (
        <EmptyStateCard
          icon={ClipboardList}
          title={policies.length === 0 ? 'No leave policies yet' : 'No policies match your search'}
          description={
            policies.length === 0
              ? 'Set an annual quota and accrual rule per leave type so employees can start applying for leave.'
              : 'Try a different search term.'
          }
        />
      )}

      {(isLoading || filteredPolicies.length > 0) && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={filteredPolicies}
              rowKey={(p) => p.id}
              columns={[
                { key: 'leaveType', header: 'Leave Type', render: (p) => p.leaveType?.name ?? p.leaveTypeId },
                {
                  key: 'roster',
                  header: 'Applies To',
                  render: (p) => <RosterChips rosterGroups={p.rosterGroups ?? []} onView={setViewingRosterGroup} />,
                },
                { key: 'quota', header: 'Annual Quota', render: (p) => `${p.annualQuota} days` },
                { key: 'accrual', header: 'Accrual', render: (p) => ACCRUAL_LABELS[p.accrual] },
                { key: 'eligibility', header: 'Eligible After', render: (p) => eligibilityLabel(p) },
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
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <LeavePolicyCardSkeleton />}
            {!isLoading &&
              filteredPolicies.map((policy) => (
                <LeavePolicyCard
                  key={policy.id}
                  policy={policy}
                  onViewRoster={setViewingRosterGroup}
                  onEdit={canUpdate ? () => setEditingPolicy(policy) : undefined}
                />
              ))}
          </div>
        </>
      )}

      {editingPolicy && (
        <LeavePolicyFormModal
          policy={editingPolicy === 'new' ? undefined : editingPolicy}
          leaveTypes={leaveTypes}
          onLeaveTypeCreated={(leaveType) => setLeaveTypes((prev) => [...prev, leaveType])}
          onClose={() => setEditingPolicy(null)}
          onSaved={loadPolicies}
        />
      )}

      {viewingRosterGroup && (
        <RosterGroupDetailModal
          rosterGroup={viewingRosterGroup}
          allEmployees={employees}
          onClose={() => setViewingRosterGroup(null)}
          onUpdated={loadPolicies}
        />
      )}
    </div>
  );
}

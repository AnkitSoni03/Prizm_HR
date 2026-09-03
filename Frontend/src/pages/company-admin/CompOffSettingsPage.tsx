import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarClock, Pencil, Plus, RefreshCw, Trash2, UserCog } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { DetailRow } from '../../components/ui/DetailRow';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import {
  assignCompOffPolicy,
  deleteCompOffPolicy,
  listCompOffPolicies,
  listEmployeesForCompOffAssignment,
  type CompOffPolicy,
  type CompOffPolicyEmployee,
} from '../../api/companyAdmin/compOffPolicies';
import { CompOffPolicyFormModal } from './components/CompOffPolicyFormModal';

type Tab = 'policies' | 'assign';

function extractError(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return typeof message === 'string' ? message : fallback;
}

export function CompOffSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('policies');

  return (
    <div>
      <Tabs
        items={[
          { key: 'policies', label: 'Policies', icon: RefreshCw },
          { key: 'assign', label: 'Assign Employees', icon: UserCog },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {activeTab === 'policies' && <PoliciesTab />}
      {activeTab === 'assign' && <AssignTab />}
    </div>
  );
}

function PolicyCardSkeleton() {
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
          </div>
        </div>
      ))}
    </>
  );
}

interface PolicyCardProps {
  policy: CompOffPolicy;
  onEdit?: () => void;
  onDelete?: () => void;
}

function PolicyCard({ policy, onEdit, onDelete }: PolicyCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
          <RefreshCw className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{policy.name}</p>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow
          icon={CalendarClock}
          label="Expiry"
          value={policy.carryForward ? <Badge tone="success">Never expires</Badge> : `${policy.expiryDays} days`}
        />
      </div>

      {(onEdit || onDelete) && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${policy.name}`}
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
              aria-label={`Delete ${policy.name}`}
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

function PoliciesTab() {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const canCreate = hasPermission('comp_off_policy:create');
  const canUpdate = hasPermission('comp_off_policy:update');
  const canDelete = hasPermission('comp_off_policy:delete');

  const [policies, setPolicies] = useState<CompOffPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<CompOffPolicy | 'new' | null>(null);
  const [search, setSearch] = useState('');

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      setPolicies(await listCompOffPolicies());
    } catch {
      setError('Could not load comp-off policies.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const filteredPolicies = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return policies;
    return policies.filter((p) => p.name.toLowerCase().includes(needle));
  }, [policies, search]);

  async function handleDelete(policy: CompOffPolicy) {
    const confirmed = await confirm({
      title: 'Delete comp-off policy',
      message: `Delete "${policy.name}"? This only works if no employee is currently assigned to it.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteCompOffPolicy(policy.id);
      load();
    } catch (err) {
      showToast(extractError(err, 'Could not delete this policy.'));
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <RefreshCw className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm text-ink-muted">
            Comp-off is opt-in — an employee earns nothing until they're assigned one of these policies
            on the Assign Employees tab.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setEditingPolicy('new')} className="shrink-0">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Policy
          </Button>
        )}
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search policies…" value={search} onChange={setSearch} />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && filteredPolicies.length === 0 && (
        <EmptyStateCard
          icon={RefreshCw}
          title={policies.length === 0 ? 'No comp-off policies yet' : 'No policies match your search'}
          description={
            policies.length === 0
              ? 'Add one to get started — e.g. "Standard Comp-Off" with a 90-day expiry.'
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
                { key: 'name', header: 'Name', render: (p) => <span className="font-medium text-ink">{p.name}</span> },
                {
                  key: 'expiry',
                  header: 'Expiry',
                  render: (p) => (p.carryForward ? <Badge tone="success">Never expires</Badge> : `${p.expiryDays} days`),
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-24 text-right',
                  render: (p) =>
                    (canUpdate || canDelete) && (
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => setEditingPolicy(p)}
                            aria-label={`Edit ${p.name}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            aria-label={`Delete ${p.name}`}
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
            {isLoading && <PolicyCardSkeleton />}
            {!isLoading &&
              filteredPolicies.map((p) => (
                <PolicyCard
                  key={p.id}
                  policy={p}
                  onEdit={canUpdate ? () => setEditingPolicy(p) : undefined}
                  onDelete={canDelete ? () => handleDelete(p) : undefined}
                />
              ))}
          </div>
        </>
      )}

      {editingPolicy && (
        <CompOffPolicyFormModal
          policy={editingPolicy === 'new' ? undefined : editingPolicy}
          onClose={() => setEditingPolicy(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function EmployeeCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </>
  );
}

interface EmployeeCardProps {
  employee: CompOffPolicyEmployee;
  selected: boolean;
  onToggleSelect: () => void;
}

function EmployeeCard({ employee, selected, onToggleSelect }: EmployeeCardProps) {
  return (
    <div
      className={[
        'rounded-2xl border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5',
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border',
      ].join(' ')}
    >
      <label className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-border accent-primary"
            checked={selected}
            onChange={onToggleSelect}
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-ink">
              {employee.name || employee.employeeCode || '—'}
            </span>
            <span className="block text-xs text-ink-muted">{employee.employeeCode || '—'}</span>
          </span>
        </span>
        <span className="shrink-0">
          {employee.compOffPolicy ? (
            <Badge tone="success">{employee.compOffPolicy.name}</Badge>
          ) : (
            <Badge tone="neutral">Not enrolled</Badge>
          )}
        </span>
      </label>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow icon={Building2} label="Department" value={employee.department?.name ?? '—'} />
      </div>
    </div>
  );
}

function AssignTab() {
  const { hasPermission } = useAuth();
  const showToast = useToast();
  const canAssign = hasPermission('comp_off_policy:assign');

  const [policies, setPolicies] = useState<CompOffPolicy[]>([]);
  const [employees, setEmployees] = useState<CompOffPolicyEmployee[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [targetPolicyId, setTargetPolicyId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listEmployeesForCompOffAssignment(search.trim() || undefined);
      setEmployees(result);
    } catch {
      setError('Could not load employees.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    listCompOffPolicies()
      .then(setPolicies)
      .catch(() => setPolicies([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function toggleSelected(employeeId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  const allSelected = employees.length > 0 && employees.every((e) => selectedIds.has(e.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) employees.forEach((e) => next.delete(e.id));
      else employees.forEach((e) => next.add(e.id));
      return next;
    });
  }

  function openAssignModal() {
    setTargetPolicyId(policies[0]?.id ?? '');
    setSubmitError(null);
    setIsAssignModalOpen(true);
  }

  async function submitAssign(compOffPolicyId: string | null) {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await assignCompOffPolicy({ employeeIds: [...selectedIds], compOffPolicyId });
      showToast(`Updated ${result.updated} employee${result.updated === 1 ? '' : 's'}.`, 'success');
      setIsAssignModalOpen(false);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      setSubmitError(extractError(err, 'Could not assign this policy.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
          <UserCog className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <p className="text-sm text-ink-muted">
          Select one or more employees, then assign (or remove) a comp-off policy for all of them at once.
        </p>
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search employee…" value={search} onChange={setSearch} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-xs">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={allSelected}
            onChange={toggleSelectAll}
            disabled={employees.length === 0}
          />
          Select all
        </label>
        {canAssign && (
          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && <Badge tone="neutral">{selectedIds.size} selected</Badge>}
            <Button onClick={openAssignModal} disabled={selectedIds.size === 0}>
              Assign Comp-Off Policy
            </Button>
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && employees.length === 0 && (
        <EmptyStateCard
          title="No employees found"
          description={search ? 'Try a different search term.' : 'No active employees to show.'}
        />
      )}

      {(isLoading || employees.length > 0) && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={employees}
              rowKey={(e) => e.id}
              columns={[
                {
                  key: 'select',
                  header: '',
                  className: 'w-10',
                  render: (e) => (
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleSelected(e.id)}
                    />
                  ),
                },
                { key: 'employee', header: 'Employee', render: (e) => e.name || e.employeeCode || '—' },
                { key: 'code', header: 'Code', render: (e) => e.employeeCode || '—' },
                { key: 'department', header: 'Department', render: (e) => e.department?.name ?? '—' },
                {
                  key: 'policy',
                  header: 'Comp-Off Policy',
                  render: (e) =>
                    e.compOffPolicy ? (
                      <Badge tone="success">{e.compOffPolicy.name}</Badge>
                    ) : (
                      <Badge tone="neutral">Not enrolled</Badge>
                    ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <EmployeeCardSkeleton />}
            {!isLoading &&
              employees.map((e) => (
                <EmployeeCard key={e.id} employee={e} selected={selectedIds.has(e.id)} onToggleSelect={() => toggleSelected(e.id)} />
              ))}
          </div>
        </>
      )}

      {isAssignModalOpen && (
        <Modal title="Assign Comp-Off Policy" onClose={() => setIsAssignModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Assigning for {selectedIds.size} employee{selectedIds.size === 1 ? '' : 's'}.
            </p>
            <Select
              id="comp-off-assign-policy"
              label="Comp-Off Policy"
              value={targetPolicyId}
              onChange={(event) => setTargetPolicyId(event.target.value)}
              options={policies.map((p) => ({ value: p.id, label: p.name }))}
              placeholder={policies.length === 0 ? 'No policies yet — create one first' : undefined}
            />
            {submitError && <p className="text-sm text-danger">{submitError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => submitAssign(null)}
                isLoading={isSubmitting}
              >
                Remove from Comp-Off
              </Button>
              <Button
                onClick={() => submitAssign(targetPolicyId)}
                isLoading={isSubmitting}
                disabled={!targetPolicyId}
              >
                Assign
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

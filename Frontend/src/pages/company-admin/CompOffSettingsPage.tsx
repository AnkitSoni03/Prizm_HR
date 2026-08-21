import { useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
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
          { key: 'policies', label: 'Policies' },
          { key: 'assign', label: 'Assign Employees' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {activeTab === 'policies' && <PoliciesTab />}
      {activeTab === 'assign' && <AssignTab />}
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <RefreshCw className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
          Comp-off is opt-in — an employee earns nothing until they're assigned one of these policies
          on the Assign Employees tab.
        </p>
        {canCreate && (
          <Button onClick={() => setEditingPolicy('new')}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Policy
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && policies.length === 0 && (
        <EmptyStateCard
          icon={RefreshCw}
          title="No comp-off policies yet"
          description='Add one to get started — e.g. "Standard Comp-Off" with a 90-day expiry.'
        />
      )}

      {(isLoading || policies.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={policies}
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
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <label htmlFor="comp-off-assign-search" className="mb-1.5 block text-sm font-medium text-ink">
            Search employee
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" strokeWidth={1.75} />
            <input
              id="comp-off-assign-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or employee code"
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
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
            {selectedIds.size > 0 && <span className="text-sm text-ink-muted">{selectedIds.size} selected</span>}
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

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  Eye,
  FileText,
  Hash,
  IndianRupee,
  Layers,
  Percent,
  Plus,
  Settings,
  Tag,
  Wallet,
} from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { DetailRow } from '../../components/ui/DetailRow';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { listEmployees } from '../../api/companyAdmin/employees';
import type { Employee } from '../../api/tenancy';
import { formatEmployeeLabel } from '../../utils/employeeDisplay';
import { PayrollSettingsForm } from './components/PayrollSettingsForm';
import { SalaryComponentFormModal } from './components/SalaryComponentFormModal';
import { SalaryStructureFormModal } from './components/SalaryStructureFormModal';
import { PayrollAdjustmentFormModal } from './components/PayrollAdjustmentFormModal';
import { PayrollRunDetailModal } from './components/PayrollRunDetailModal';
import {
  deactivateSalaryComponent,
  listSalaryComponents,
  updateSalaryComponent,
  type SalaryComponentDefinition,
} from '../../api/companyAdmin/salaryComponents';
import { listStructuresForEmployee, type EmployeeSalaryStructure } from '../../api/companyAdmin/salaryStructures';
import {
  cancelPayrollAdjustment,
  listPayrollAdjustments,
  type PayrollAdjustment,
} from '../../api/companyAdmin/payrollAdjustments';
import { createPayrollRun, listPayrollRuns, type PayrollRun } from '../../api/companyAdmin/payrollRuns';
import { formatDisplayDate } from '../../utils/dateDisplay';

type Tab = 'settings' | 'components' | 'structures' | 'adjustments' | 'runs';
const LIMIT = 20;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// A bordered icon-tile banner — the same header treatment every other
// list-style admin page uses (Organization, Shifts, Roster, Holidays,
// Leave Types...) — shared across this page's four list tabs so a change
// here stays consistent everywhere.
function TabBanner({
  icon: Icon,
  description,
  action,
}: {
  icon: typeof Wallet;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function CardGridSkeleton() {
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

export function PayrollPage() {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = (['settings', 'components', 'structures', 'adjustments', 'runs'] as Tab[]).includes(
    requestedTab as Tab
  )
    ? (requestedTab as Tab)
    : 'runs';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div>
      <Tabs
        items={[
          { key: 'runs', label: 'Payroll Runs', icon: IndianRupee },
          { key: 'structures', label: 'Salary Structures', icon: Layers },
          { key: 'adjustments', label: 'Adjustments', icon: Percent },
          { key: 'components', label: 'Components', icon: Hash },
          { key: 'settings', label: 'Settings', icon: Settings },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {activeTab === 'settings' && <PayrollSettingsForm />}
      {activeTab === 'components' && <ComponentsTab canWrite={hasPermission('salary_component:create')} />}
      {activeTab === 'structures' && <StructuresTab canWrite={hasPermission('salary_structure:create')} />}
      {activeTab === 'adjustments' && (
        <AdjustmentsTab
          canCreate={hasPermission('payroll_adjustment:create')}
          canDelete={hasPermission('payroll_adjustment:delete')}
        />
      )}
      {activeTab === 'runs' && <RunsTab canCreate={hasPermission('payroll_run:create')} />}
    </div>
  );
}

interface ComponentCardProps {
  component: SalaryComponentDefinition;
  canWrite: boolean;
  onToggle: () => void;
}

function ComponentCard({ component, canWrite, onToggle }: ComponentCardProps) {
  const calcLabel =
    component.calculationType === 'fixed_amount'
      ? `Fixed: ${component.defaultValue}`
      : `${component.defaultValue}% of ${component.percentageOfComponent?.name ?? '—'}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <Hash className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{component.name}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{component.code}</p>
          </div>
        </div>
        <div className="shrink-0">
          <Badge tone={component.isActive ? 'success' : 'neutral'}>{component.isActive ? 'active' : 'inactive'}</Badge>
        </div>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow icon={Tag} label="Category" value={<Badge tone="neutral">{component.componentCategory}</Badge>} />
        <DetailRow icon={Percent} label="Calculation" value={calcLabel} />
      </div>

      {canWrite && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-light"
          >
            {component.isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      )}
    </div>
  );
}

function ComponentsTab({ canWrite }: { canWrite: boolean }) {
  const showToast = useToast();
  const [components, setComponents] = useState<SalaryComponentDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      setComponents(await listSalaryComponents(true));
    } catch {
      setError('Could not load salary components.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const filteredComponents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return components;
    return components.filter((c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle));
  }, [components, search]);

  async function toggleActive(component: SalaryComponentDefinition) {
    try {
      if (component.isActive) await deactivateSalaryComponent(component.id);
      else await updateSalaryComponent(component.id, { isActive: true });
      load();
    } catch {
      showToast('Could not update this component.');
    }
  }

  return (
    <div>
      <TabBanner
        icon={Hash}
        description="The catalog of pay components (Basic, HRA, allowances, deductions) used to build employee salary structures."
        action={
          canWrite && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              Add Component
            </Button>
          )
        }
      />

      <div className="mb-4">
        <SearchInput placeholder="Search components…" value={search} onChange={setSearch} />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && filteredComponents.length === 0 && (
        <EmptyStateCard
          icon={Wallet}
          title={components.length === 0 ? 'No salary components yet' : 'No components match your search'}
          description={
            components.length === 0
              ? 'Add Basic, HRA, and other pay components before assigning salary structures.'
              : 'Try a different search term.'
          }
        />
      )}

      {(isLoading || filteredComponents.length > 0) && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={filteredComponents}
              rowKey={(c) => c.id}
              columns={[
                { key: 'name', header: 'Name', render: (c) => <span className="font-medium text-ink">{c.name}</span> },
                { key: 'code', header: 'Code', render: (c) => c.code },
                { key: 'category', header: 'Category', render: (c) => <Badge tone="neutral">{c.componentCategory}</Badge> },
                {
                  key: 'calculation',
                  header: 'Calculation',
                  render: (c) =>
                    c.calculationType === 'fixed_amount'
                      ? `Fixed: ${c.defaultValue}`
                      : `${c.defaultValue}% of ${c.percentageOfComponent?.name ?? '—'}`,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (c) => <Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'active' : 'inactive'}</Badge>,
                },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-28 text-right',
                  render: (c) =>
                    canWrite && (
                      <button
                        type="button"
                        onClick={() => toggleActive(c)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {c.isActive ? 'Disable' : 'Enable'}
                      </button>
                    ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <CardGridSkeleton />}
            {!isLoading &&
              filteredComponents.map((c) => (
                <ComponentCard key={c.id} component={c} canWrite={canWrite} onToggle={() => toggleActive(c)} />
              ))}
          </div>
        </>
      )}

      {showForm && (
        <SalaryComponentFormModal
          existingComponents={components.filter((c) => c.isActive)}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function StructureCard({ structure }: { structure: EmployeeSalaryStructure }) {
  const monthlyGross = structure.components
    .filter((c) => c.definition?.componentCategory !== 'deduction')
    .reduce((sum, c) => sum + Number(c.resolvedAmount), 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <IndianRupee className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="min-w-0 truncate text-[15px] font-semibold text-ink">
            {Number(structure.annualCtc).toLocaleString()} / year
          </p>
        </div>
        <div className="shrink-0">
          <Badge tone={structure.status === 'active' ? 'success' : 'neutral'}>{structure.status}</Badge>
        </div>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow icon={CalendarDays} label="Effective From" value={formatDisplayDate(structure.effectiveFrom)} />
        <DetailRow
          icon={CalendarDays}
          label="Effective To"
          value={structure.effectiveTo ? formatDisplayDate(structure.effectiveTo) : '—'}
        />
        <DetailRow icon={Wallet} label="Monthly Gross" value={monthlyGross.toLocaleString()} />
      </div>
    </div>
  );
}

function StructuresTab({ canWrite }: { canWrite: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [components, setComponents] = useState<SalaryComponentDefinition[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [structures, setStructures] = useState<EmployeeSalaryStructure[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [employeeResult, componentResult] = await Promise.all([
          listEmployees({ status: 'active', limit: 100 }),
          listSalaryComponents(false),
        ]);
        setEmployees(employeeResult.data);
        setComponents(componentResult);
      } catch {
        setError('Could not load employees or salary components.');
      }
    })();
  }, []);

  async function loadStructures(employeeId: string) {
    setIsLoading(true);
    setError(null);
    try {
      setStructures(await listStructuresForEmployee(employeeId));
    } catch {
      setError('Could not load salary structures for this employee.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelectEmployee(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    if (employeeId) loadStructures(employeeId);
    else setStructures([]);
  }

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);
  const hasActiveStructure = structures.some((s) => s.status === 'active');

  return (
    <div>
      <TabBanner icon={Layers} description="Look up one employee to see their salary structure history, or assign a new one." />

      <div className="mb-4 max-w-sm">
        <Select
          id="structures-employee-picker"
          label="Employee"
          value={selectedEmployeeId}
          onChange={(event) => handleSelectEmployee(event.target.value)}
          placeholder="Select an employee"
          options={employees.map((e) => ({ value: e.id, label: formatEmployeeLabel(e) }))}
        />
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {selectedEmployeeId && (
        <>
          <div className="mb-3 flex justify-end">
            {canWrite && components.length > 0 && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                {hasActiveStructure ? 'Revise Structure' : 'Assign Structure'}
              </Button>
            )}
          </div>

          {!isLoading && structures.length === 0 && (
            <EmptyStateCard
              icon={Wallet}
              title="No salary structure yet"
              description="This employee has no salary structure assigned."
            />
          )}

          {(isLoading || structures.length > 0) && (
            <>
              <div className="hidden md:block">
                <Table
                  isLoading={isLoading}
                  rows={structures}
                  rowKey={(s) => s.id}
                  columns={[
                    { key: 'from', header: 'Effective From', render: (s) => formatDisplayDate(s.effectiveFrom) },
                    { key: 'to', header: 'Effective To', render: (s) => (s.effectiveTo ? formatDisplayDate(s.effectiveTo) : '—') },
                    { key: 'ctc', header: 'Annual CTC', render: (s) => Number(s.annualCtc).toLocaleString() },
                    {
                      key: 'components',
                      header: 'Monthly Gross',
                      render: (s) =>
                        s.components
                          .filter((c) => c.definition?.componentCategory !== 'deduction')
                          .reduce((sum, c) => sum + Number(c.resolvedAmount), 0)
                          .toLocaleString(),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (s) => <Badge tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status}</Badge>,
                    },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
                {isLoading && <CardGridSkeleton />}
                {!isLoading && structures.map((s) => <StructureCard key={s.id} structure={s} />)}
              </div>
            </>
          )}
        </>
      )}

      {showForm && selectedEmployee && (
        <SalaryStructureFormModal
          employeeId={selectedEmployee.id}
          employeeName={selectedEmployee.name ?? selectedEmployee.employeeCode}
          components={components}
          hasExistingStructure={hasActiveStructure}
          onClose={() => setShowForm(false)}
          onSaved={() => loadStructures(selectedEmployeeId)}
        />
      )}
    </div>
  );
}

const ADJUSTMENT_STATUS_TONE: Record<PayrollAdjustment['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  applied: 'success',
  cancelled: 'danger',
};

function AdjustmentCard({ adjustment, canDelete, onCancel }: { adjustment: PayrollAdjustment; canDelete: boolean; onCancel: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <Percent className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="min-w-0 truncate text-[15px] font-semibold text-ink">
            {adjustment.employee?.name ?? adjustment.employee?.employeeCode ?? adjustment.employeeId}
          </p>
        </div>
        <div className="shrink-0">
          <Badge tone={ADJUSTMENT_STATUS_TONE[adjustment.status]}>{adjustment.status}</Badge>
        </div>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow icon={CalendarDays} label="Period" value={`${adjustment.periodMonth}/${adjustment.periodYear}`} />
        <DetailRow icon={Tag} label="Type" value={<Badge tone={adjustment.type === 'bonus' ? 'success' : 'danger'}>{adjustment.type}</Badge>} />
        <DetailRow icon={IndianRupee} label="Amount" value={Number(adjustment.amount).toLocaleString()} />
        <DetailRow icon={FileText} label="Description" value={adjustment.description ?? '—'} />
      </div>

      {canDelete && adjustment.status === 'pending' && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            Cancel Adjustment
          </button>
        </div>
      )}
    </div>
  );
}

function AdjustmentsTab({ canCreate, canDelete }: { canCreate: boolean; canDelete: boolean }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listPayrollAdjustments({ limit: LIMIT, offset });
      setAdjustments(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load payroll adjustments.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  useEffect(() => {
    listEmployees({ status: 'active', limit: 100 })
      .then((result) => setEmployees(result.data))
      .catch(() => {});
  }, []);

  async function handleCancel(adjustment: PayrollAdjustment) {
    const confirmed = await confirm({
      title: 'Cancel adjustment',
      message: 'Cancel this pending adjustment?',
      confirmLabel: 'Cancel Adjustment',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await cancelPayrollAdjustment(adjustment.id);
      load();
    } catch {
      showToast('Could not cancel this adjustment.');
    }
  }

  return (
    <div>
      <TabBanner
        icon={Percent}
        description="One-off bonuses or deductions applied to an employee's next unprocessed payroll run."
        action={
          canCreate && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              Add Adjustment
            </Button>
          )
        }
      />

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && adjustments.length === 0 ? (
        <EmptyStateCard icon={Percent} title="No payroll adjustments yet" description="Add a one-off bonus or deduction to get started." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={adjustments}
              rowKey={(a) => a.id}
              emptyMessage="No payroll adjustments found."
              columns={[
                { key: 'employee', header: 'Employee', render: (a) => a.employee?.name ?? a.employee?.employeeCode ?? a.employeeId },
                { key: 'period', header: 'Period', render: (a) => `${a.periodMonth}/${a.periodYear}` },
                { key: 'type', header: 'Type', render: (a) => <Badge tone={a.type === 'bonus' ? 'success' : 'danger'}>{a.type}</Badge> },
                { key: 'amount', header: 'Amount', render: (a) => Number(a.amount).toLocaleString() },
                { key: 'description', header: 'Description', render: (a) => a.description ?? '—' },
                { key: 'status', header: 'Status', render: (a) => <Badge tone={ADJUSTMENT_STATUS_TONE[a.status]}>{a.status}</Badge> },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-20 text-right',
                  render: (a) =>
                    canDelete &&
                    a.status === 'pending' && (
                      <button type="button" onClick={() => handleCancel(a)} className="text-xs font-medium text-danger hover:underline">
                        Cancel
                      </button>
                    ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <CardGridSkeleton />}
            {!isLoading &&
              adjustments.map((a) => (
                <AdjustmentCard key={a.id} adjustment={a} canDelete={canDelete} onCancel={() => handleCancel(a)} />
              ))}
          </div>
        </>
      )}
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {showForm && (
        <PayrollAdjustmentFormModal employees={employees} onClose={() => setShowForm(false)} onSaved={load} />
      )}
    </div>
  );
}

const RUN_STATUS_TONE: Record<PayrollRun['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'warning',
  processed: 'neutral',
  paid: 'success',
  cancelled: 'danger',
};

function RunCard({ run, onView }: { run: PayrollRun; onView: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <IndianRupee className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="min-w-0 truncate text-[15px] font-semibold text-ink">
            {MONTHS[run.periodMonth - 1]} {run.periodYear}
          </p>
        </div>
        <div className="shrink-0">
          <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>
        </div>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow icon={IndianRupee} label="Gross" value={run.totalGross != null ? Number(run.totalGross).toLocaleString() : '—'} />
        <DetailRow icon={Wallet} label="Net" value={run.totalNet != null ? Number(run.totalNet).toLocaleString() : '—'} />
      </div>

      <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={onView}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-light"
        >
          <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
          View
        </button>
      </div>
    </div>
  );
}

function RunsTab({ canCreate }: { canCreate: boolean }) {
  const now = new Date();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [newMonth, setNewMonth] = useState(String(now.getMonth() + 1));
  const [newYear, setNewYear] = useState(String(now.getFullYear()));
  const [isCreating, setIsCreating] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listPayrollRuns({ limit: LIMIT, offset });
      setRuns(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load payroll runs.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  async function handleCreate() {
    setIsCreating(true);
    setError(null);
    try {
      const run = await createPayrollRun({ periodMonth: Number(newMonth), periodYear: Number(newYear) });
      await load();
      setSelectedRun(run);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not create a payroll run for that period.';
      setError(message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div>
      {canCreate && (
        <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary sm:self-end">
            <IndianRupee className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="w-full sm:w-40">
            <Select
              id="new-run-month"
              label="Month"
              value={newMonth}
              onChange={(event) => setNewMonth(event.target.value)}
              options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
            />
          </div>
          <div className="w-full sm:w-28">
            <Input id="new-run-year" label="Year" type="number" value={newYear} onChange={(event) => setNewYear(event.target.value)} />
          </div>
          <Button onClick={handleCreate} isLoading={isCreating} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Create Draft Run
          </Button>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && runs.length === 0 && (
        <EmptyStateCard icon={Wallet} title="No payroll runs yet" description="Create a draft run for a month to get started." />
      )}

      {(isLoading || runs.length > 0) && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={runs}
              rowKey={(r) => r.id}
              columns={[
                { key: 'period', header: 'Period', render: (r) => `${r.periodMonth}/${r.periodYear}` },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={RUN_STATUS_TONE[r.status]}>{r.status}</Badge> },
                { key: 'gross', header: 'Gross', render: (r) => (r.totalGross != null ? Number(r.totalGross).toLocaleString() : '—') },
                { key: 'net', header: 'Net', render: (r) => (r.totalNet != null ? Number(r.totalNet).toLocaleString() : '—') },
                {
                  key: 'actions',
                  header: '',
                  className: 'w-20 text-right',
                  render: (r) => (
                    <button type="button" onClick={() => setSelectedRun(r)} className="text-xs font-medium text-primary hover:underline">
                      View
                    </button>
                  ),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <CardGridSkeleton />}
            {!isLoading && runs.map((r) => <RunCard key={r.id} run={r} onView={() => setSelectedRun(r)} />)}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {selectedRun && (
        <PayrollRunDetailModal run={selectedRun} onClose={() => setSelectedRun(null)} onChanged={load} />
      )}
    </div>
  );
}

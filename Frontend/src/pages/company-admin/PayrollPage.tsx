import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Wallet } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { listEmployees } from '../../api/companyAdmin/employees';
import type { Employee } from '../../api/tenancy';
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
          { key: 'runs', label: 'Payroll Runs' },
          { key: 'structures', label: 'Salary Structures' },
          { key: 'adjustments', label: 'Adjustments' },
          { key: 'components', label: 'Components' },
          { key: 'settings', label: 'Settings' },
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

function ComponentsTab({ canWrite }: { canWrite: boolean }) {
  const [components, setComponents] = useState<SalaryComponentDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  async function toggleActive(component: SalaryComponentDefinition) {
    try {
      if (component.isActive) await deactivateSalaryComponent(component.id);
      else await updateSalaryComponent(component.id, { isActive: true });
      load();
    } catch {
      window.alert('Could not update this component.');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          The catalog of pay components (Basic, HRA, allowances, deductions) used to build
          employee salary structures.
        </p>
        {canWrite && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Component
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && components.length === 0 && (
        <EmptyStateCard
          icon={Wallet}
          title="No salary components yet"
          description="Add Basic, HRA, and other pay components before assigning salary structures."
        />
      )}

      {(isLoading || components.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={components}
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
      <div className="mb-4 max-w-sm">
        <Select
          id="structures-employee-picker"
          label="Employee"
          value={selectedEmployeeId}
          onChange={(event) => handleSelectEmployee(event.target.value)}
          placeholder="Select an employee"
          options={employees.map((e) => ({ value: e.id, label: `${e.name ?? e.employeeCode} (${e.employeeCode})` }))}
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

function AdjustmentsTab({ canCreate, canDelete }: { canCreate: boolean; canDelete: boolean }) {
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
    if (!window.confirm('Cancel this pending adjustment?')) return;
    try {
      await cancelPayrollAdjustment(adjustment.id);
      load();
    } catch {
      window.alert('Could not cancel this adjustment.');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          One-off bonuses or deductions applied to an employee's next unprocessed payroll run.
        </p>
        {canCreate && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Adjustment
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

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
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <div className="w-40">
            <Select
              id="new-run-month"
              label="Month"
              value={newMonth}
              onChange={(event) => setNewMonth(event.target.value)}
              options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
            />
          </div>
          <div className="w-28">
            <Input id="new-run-year" label="Year" type="number" value={newYear} onChange={(event) => setNewYear(event.target.value)} />
          </div>
          <Button onClick={handleCreate} isLoading={isCreating}>
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
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {selectedRun && (
        <PayrollRunDetailModal run={selectedRun} onClose={() => setSelectedRun(null)} onChanged={load} />
      )}
    </div>
  );
}

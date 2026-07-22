import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Wallet } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../context/auth-context';
import { listEmployees } from '../../api/companyAdmin/employees';
import { listBrands, listDepartments } from '../../api/companyAdmin/org';
import { adjustLeaveBalance, listLeaveTypes, type LeaveType } from '../../api/companyAdmin/leaveBalance';
import type { Brand, Department, Employee } from '../../api/tenancy';

const LIMIT = 20;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

// "HR will provide leaves by selecting multiple or single employee... based
// on their policy" — a bulk sibling to the per-employee Leave Balance tab
// on EmployeeDetailModal.tsx, using the same leave_balance:adjust endpoint
// (POST /leave/balances/adjust, one call per selected employee — there's no
// bulk endpoint, so this fans out with Promise.allSettled, same pattern
// DepartmentFormModal.tsx already uses for its bulk-create path).
export function ProvideLeavesPage() {
  const { hasPermission, user } = useAuth();
  const canAdjust = hasPermission('leave_balance:adjust');
  const usesBrands = user?.companyUsesBrands ?? true;

  const [brands, setBrands] = useState<Brand[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [brandFilter, setBrandFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [allotted, setAllotted] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ succeeded: number; failed: number } | null>(null);

  useEffect(() => {
    Promise.all([listBrands(), listDepartments(), listLeaveTypes()])
      .then(([b, d, types]) => {
        setBrands(b);
        setDepartments(d);
        setLeaveTypes(types);
        setLeaveTypeId((prev) => prev || types[0]?.id || '');
      })
      .catch(() => setError('Could not load brands/departments/leave types.'));
  }, []);

  async function loadEmployees() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listEmployees({
        brandId: brandFilter || undefined,
        departmentId: departmentFilter || undefined,
        limit: LIMIT,
        offset,
      });
      setEmployees(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load employees.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandFilter, departmentFilter, offset]);

  function handleFilterChange(setter: (value: string) => void) {
    return (value: string) => {
      setOffset(0);
      setter(value);
    };
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOnPage() {
    setSelectedIds((prev) => new Set([...prev, ...employees.map((e) => e.id)]));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleApply(event: FormEvent) {
    event.preventDefault();
    const amount = Number(allotted);
    if (!leaveTypeId || selectedIds.size === 0 || allotted === '' || Number.isNaN(amount) || amount < 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSummary(null);
    try {
      const ids = [...selectedIds];
      const results = await Promise.allSettled(
        ids.map((employeeId) => adjustLeaveBalance({ employeeId, leaveTypeId, year, allotted: amount }))
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      setSummary({ succeeded, failed: results.length - succeeded });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canAdjust) {
    return <p className="text-sm text-ink-muted">You don&apos;t have access to provide leave balances.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Select employees below, choose a leave type and amount, then apply it to everyone selected at once. It
        shows up immediately on each employee's own Leave Balance page.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        {usesBrands && (
          <div className="w-full sm:w-48">
            <Select
              id="filter-brand"
              label="Brand"
              value={brandFilter}
              onChange={(event) => handleFilterChange(setBrandFilter)(event.target.value)}
              placeholder="All brands"
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
        )}
        <div className="w-full sm:w-48">
          <Select
            id="filter-department"
            label="Department"
            value={departmentFilter}
            onChange={(event) => handleFilterChange(setDepartmentFilter)(event.target.value)}
            placeholder="All departments"
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        <Button type="button" variant="secondary" onClick={selectAllOnPage} disabled={employees.length === 0}>
          Select all on this page
        </Button>
        <Button type="button" variant="secondary" onClick={clearSelection} disabled={selectedIds.size === 0}>
          Clear selection ({selectedIds.size})
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!isLoading && !error && employees.length === 0 && (
        <EmptyStateCard
          icon={Wallet}
          title="No employees found"
          description="Try adjusting your filters."
        />
      )}

      {(isLoading || employees.length > 0) && (
        <>
          <Table
            isLoading={isLoading}
            rows={employees}
            rowKey={(employee) => employee.id}
            columns={[
              {
                key: 'select',
                header: '',
                className: 'w-10',
                render: (employee) => (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(employee.id)}
                    onChange={() => toggleSelected(employee.id)}
                    aria-label={`Select ${employee.name}`}
                  />
                ),
              },
              {
                key: 'name',
                header: 'Name',
                render: (employee) => (
                  <div className="flex items-center gap-2.5">
                    <Avatar src={employee.photoDownloadUrl} size="sm" />
                    {employee.name ?? '—'}
                  </div>
                ),
              },
              { key: 'code', header: 'Code', render: (employee) => employee.employeeCode },
              {
                key: 'department',
                header: 'Department',
                render: (employee) => departments.find((d) => d.id === employee.departmentId)?.name ?? '—',
              },
            ]}
          />
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      <form
        onSubmit={handleApply}
        className="space-y-4 rounded-xl border border-border bg-card p-5"
      >
        <p className="text-sm font-semibold text-ink">
          Apply to {selectedIds.size} selected employee{selectedIds.size === 1 ? '' : 's'}
        </p>
        {submitError && <p className="text-sm text-danger">{submitError}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            id="provide-leave-type"
            label="Leave Type"
            required
            value={leaveTypeId}
            onChange={(event) => setLeaveTypeId(event.target.value)}
            options={leaveTypes.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Select
            id="provide-leave-year"
            label="Year"
            value={String(year)}
            onChange={(event) => setYear(Number(event.target.value))}
            options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: String(y) }))}
          />
          <div>
            <label htmlFor="provide-leave-amount" className="mb-1.5 block text-sm font-medium text-ink">
              Total days
            </label>
            <input
              id="provide-leave-amount"
              type="number"
              min="0"
              step="0.5"
              required
              value={allotted}
              onChange={(event) => setAllotted(event.target.value)}
              placeholder="e.g. 25"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          {summary && (
            <p className="flex items-center gap-1.5 text-sm text-ink-muted">
              <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.75} />
              Applied to {summary.succeeded} employee{summary.succeeded === 1 ? '' : 's'}
              {summary.failed > 0 ? `, ${summary.failed} failed` : ''}.
            </p>
          )}
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={selectedIds.size === 0 || !leaveTypeId || allotted === ''}
            className="ml-auto"
          >
            Apply
          </Button>
        </div>
      </form>
    </div>
  );
}

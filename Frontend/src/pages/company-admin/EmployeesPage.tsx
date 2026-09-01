import { useEffect, useState } from 'react';
import { Activity, Briefcase, Building2, MoreVertical, Pencil, Plus, ShieldCheck, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/auth-context';
import { listEmployees } from '../../api/companyAdmin/employees';
import { listBrands, listDepartments, listDesignations } from '../../api/companyAdmin/org';
import { listRosterGroups, type RosterPolicyGroup } from '../../api/companyAdmin/rosterGroups';
import type { Brand, Department, Designation, Employee } from '../../api/tenancy';
import { EmployeeFormModal } from './components/EmployeeFormModal';
import { EmployeeDetailModal } from './components/EmployeeDetailModal';
import { Avatar } from '../../components/ui/Avatar';

const LIMIT = 20;

const STATUS_FILTER_OPTIONS = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active', label: 'Active' },
  { value: 'on_notice', label: 'On Notice' },
  { value: 'exited', label: 'Exited' },
  { value: 'archived', label: 'Archived' },
];

function statusTone(status: Employee['status']) {
  if (status === 'active') return 'success';
  if (status === 'onboarding' || status === 'on_notice') return 'warning';
  return 'neutral';
}

export function EmployeesPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('employee:create');
  const canReadRosterGroups = hasPermission('roster_group:read');

  const [brands, setBrands] = useState<Brand[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [rosterGroups, setRosterGroups] = useState<RosterPolicyGroup[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [brandFilter, setBrandFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    Promise.all([listBrands(), listDepartments(), listDesignations()])
      .then(([b, d, des]) => {
        setBrands(b);
        setDepartments(d);
        setDesignations(des);
      })
      .catch(() => setError('Could not load brand/department/designation lookups.'));
  }, []);

  useEffect(() => {
    if (!canReadRosterGroups) return;
    listRosterGroups()
      .then(setRosterGroups)
      .catch(() => {});
  }, [canReadRosterGroups]);

  async function loadEmployees() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listEmployees({
        brandId: brandFilter || undefined,
        departmentId: departmentFilter || undefined,
        status: statusFilter || undefined,
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
  }, [brandFilter, departmentFilter, statusFilter, offset]);

  function handleFilterChange(setter: (value: string) => void) {
    return (value: string) => {
      setOffset(0);
      setter(value);
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
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
          <div className="w-full sm:w-40">
            <Select
              id="filter-status"
              label="Status"
              value={statusFilter}
              onChange={(event) => handleFilterChange(setStatusFilter)(event.target.value)}
              placeholder="All statuses"
              options={STATUS_FILTER_OPTIONS}
            />
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Employee
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!isLoading && !error && employees.length === 0 && (
        <EmptyStateCard
          icon={Users}
          title="No employees found"
          description="Try adjusting your filters, or add your first employee to a brand with a roster."
        />
      )}

      {(isLoading || employees.length > 0) && (
        <>
          <div className="hidden md:block">
            <Table
              isLoading={isLoading}
              rows={employees}
              rowKey={(employee) => employee.id}
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  render: (employee) => (
                    <button
                      type="button"
                      onClick={() => setSelectedEmployee(employee)}
                      title="Click to view or edit"
                      className="group flex items-center gap-2.5 font-medium text-ink hover:text-primary hover:underline"
                    >
                      <Avatar src={employee.photoDownloadUrl} size="sm" />
                      {employee.name ?? '—'}
                      <Pencil
                        className="h-3.5 w-3.5 shrink-0 text-ink-muted group-hover:text-primary"
                        strokeWidth={1.75}
                      />
                    </button>
                  ),
                },
                { key: 'code', header: 'Code', render: (employee) => employee.employeeCode },
                {
                  key: 'brand',
                  header: 'Brand',
                  render: (employee) => brands.find((b) => b.id === employee.brandId)?.name ?? '—',
                },
                {
                  key: 'department',
                  header: 'Department',
                  render: (employee) => departments.find((d) => d.id === employee.departmentId)?.name ?? '—',
                },
                {
                  key: 'designation',
                  header: 'Designation',
                  render: (employee) =>
                    designations.find((d) => d.id === employee.designationId)?.title ?? '—',
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (employee) => <Badge tone={statusTone(employee.status)}>{employee.status}</Badge>,
                },
                {
                  key: 'account',
                  header: 'Account',
                  render: (employee) => (
                    <Badge tone={employee.isActive ? 'success' : 'danger'}>
                      {employee.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  ),
                },
              ]}
            />
          </div>

          {/* Mobile: a trimmed, tap-to-expand card — name/department/designation
              only, everything else lives behind EmployeeDetailModal so the list
              stays scannable on a phone instead of a cramped stacked table. */}
          <div className="space-y-2.5 md:hidden">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            {!isLoading &&
              employees.map((employee) => {
                const department = departments.find((d) => d.id === employee.departmentId)?.name;
                const designation = designations.find((d) => d.id === employee.designationId)?.title;
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => setSelectedEmployee(employee)}
                    className="block w-full rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm transition-transform active:scale-[0.98]"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar src={employee.photoDownloadUrl} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-ink">{employee.name ?? '—'}</p>
                        <p className="text-xs text-ink-muted">{employee.employeeCode}</p>
                      </div>
                      <MoreVertical className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
                    </div>

                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 text-ink-muted">
                          <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          Department
                        </span>
                        <span className="truncate font-medium text-ink">{department ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 text-ink-muted">
                          <Briefcase className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          Designation
                        </span>
                        <span className="truncate font-medium text-ink">{designation ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 text-ink-muted">
                          <Activity className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          Status
                        </span>
                        <Badge tone={statusTone(employee.status)}>{employee.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 text-ink-muted">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          Account
                        </span>
                        <Badge tone={employee.isActive ? 'success' : 'danger'}>
                          {employee.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {isCreateModalOpen && (
        <EmployeeFormModal
          brands={brands}
          departments={departments}
          designations={designations}
          employees={employees}
          rosterGroups={rosterGroups}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={loadEmployees}
          onDepartmentCreated={(department) => setDepartments((prev) => [...prev, department])}
          onDesignationCreated={(designation) => setDesignations((prev) => [...prev, designation])}
        />
      )}

      {selectedEmployee && (
        <EmployeeDetailModal
          employee={selectedEmployee}
          brands={brands}
          departments={departments}
          designations={designations}
          employees={employees}
          rosterGroups={rosterGroups}
          onClose={() => setSelectedEmployee(null)}
          onUpdated={() => {
            loadEmployees();
            setSelectedEmployee(null);
          }}
          onPhotoChanged={loadEmployees}
        />
      )}
    </div>
  );
}

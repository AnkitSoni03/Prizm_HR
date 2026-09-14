import { useEffect, useState } from 'react';
import { Activity, Briefcase, Building2, ChevronDown, ChevronUp, MoreVertical, Pencil, Plus, ShieldCheck, Users } from 'lucide-react';
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

// How many of a Brand's employees show up front in the "All brands" grouped
// view before the section is truncated behind "See all" — keeps a
// multi-brand company's employee list scannable instead of one Brand with
// 200 employees pushing every other Brand off the first several screens.
const GROUP_PREVIEW_LIMIT = 8;

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

interface EmployeeListBodyProps {
  employees: Employee[];
  isLoading: boolean;
  brands: Brand[];
  departments: Department[];
  designations: Designation[];
  onSelect: (employee: Employee) => void;
  // Suppresses the per-row Brand column — redundant once a brand-grouped
  // section already names the Brand in its own header.
  showBrandColumn?: boolean;
}

// The actual employee rows — desktop table + mobile card list — shared by
// both the plain single-list view (a specific Brand selected, or a
// direct-mode company with no Brands at all) and each Brand's own section
// in the grouped "All brands" view below.
function EmployeeListBody({
  employees,
  isLoading,
  brands,
  departments,
  designations,
  onSelect,
  showBrandColumn = true,
}: EmployeeListBodyProps) {
  return (
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
                  onClick={() => onSelect(employee)}
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
            ...(showBrandColumn
              ? [
                  {
                    key: 'brand',
                    header: 'Brand',
                    render: (employee: Employee) => brands.find((b) => b.id === employee.brandId)?.name ?? '—',
                  },
                ]
              : []),
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
                onClick={() => onSelect(employee)}
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
    </>
  );
}

interface BrandGroup {
  brand: Brand;
  employees: Employee[];
  total: number;
  isExpanded: boolean;
  isLoadingMore: boolean;
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

  // No Brand explicitly picked, and the company actually has Brands to group
  // by (a direct-mode company falls straight through to the plain list) —
  // "all shown by default, unfiltered" stays true, just organized per Brand
  // instead of one flat cross-brand list, with each Brand capped to
  // GROUP_PREVIEW_LIMIT up front.
  const isGroupedView = !brandFilter && brands.length > 0;
  const [brandGroups, setBrandGroups] = useState<BrandGroup[]>([]);
  const [isGroupsLoading, setIsGroupsLoading] = useState(true);

  // Distinguishes "brands haven't loaded yet" from "loaded, and there are
  // genuinely zero" (a direct-mode company) — brands.length alone can't
  // tell those apart, and a direct-mode company must still load its (flat,
  // ungrouped) employee list rather than waiting forever for a Brand count
  // that will never become positive.
  const [brandsLoaded, setBrandsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([listBrands(), listDepartments(), listDesignations()])
      .then(([b, d, des]) => {
        setBrands(b);
        setDepartments(d);
        setDesignations(des);
      })
      .catch(() => setError('Could not load brand/department/designation lookups.'))
      .finally(() => setBrandsLoaded(true));
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

  async function loadGroupedEmployees() {
    setIsGroupsLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        brands.map((brand) =>
          listEmployees({
            brandId: brand.id,
            departmentId: departmentFilter || undefined,
            status: statusFilter || undefined,
            limit: GROUP_PREVIEW_LIMIT,
            offset: 0,
          })
        )
      );
      setBrandGroups(
        brands
          .map((brand, i) => ({
            brand,
            employees: results[i].data,
            total: results[i].pagination.total,
            isExpanded: false,
            isLoadingMore: false,
          }))
          .filter((group) => group.total > 0)
      );
    } catch {
      setError('Could not load employees.');
    } finally {
      setIsGroupsLoading(false);
    }
  }

  // One effect drives every (re)load: filters changing, offset changing (via
  // Pagination, only meaningful in the flat/ungrouped view), or the initial
  // brand lookup settling. `offset` resets to 0 inside handleFilterChange
  // itself (same event-handler tick, so React batches both updates into one
  // re-render) rather than here, so a filter change never double-fetches.
  useEffect(() => {
    if (!brandsLoaded) return;
    if (isGroupedView) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadGroupedEmployees();
    } else {
      loadEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandsLoaded, brandFilter, departmentFilter, statusFilter, offset, isGroupedView]);

  function handleFilterChange(setter: (value: string) => void) {
    return (value: string) => {
      setOffset(0);
      setter(value);
    };
  }

  async function handleSeeAll(brandId: string) {
    setBrandGroups((prev) =>
      prev.map((g) => (g.brand.id === brandId ? { ...g, isLoadingMore: true } : g))
    );
    try {
      const group = brandGroups.find((g) => g.brand.id === brandId);
      if (!group) return;
      const result = await listEmployees({
        brandId,
        departmentId: departmentFilter || undefined,
        status: statusFilter || undefined,
        limit: group.total,
        offset: 0,
      });
      setBrandGroups((prev) =>
        prev.map((g) =>
          g.brand.id === brandId ? { ...g, employees: result.data, isExpanded: true, isLoadingMore: false } : g
        )
      );
    } catch {
      setBrandGroups((prev) =>
        prev.map((g) => (g.brand.id === brandId ? { ...g, isLoadingMore: false } : g))
      );
    }
  }

  function handleShowLess(brandId: string) {
    setBrandGroups((prev) =>
      prev.map((g) =>
        g.brand.id === brandId ? { ...g, employees: g.employees.slice(0, GROUP_PREVIEW_LIMIT), isExpanded: false } : g
      )
    );
  }

  function reloadAll() {
    if (isGroupedView) loadGroupedEmployees();
    else loadEmployees();
  }

  const allEmployeesForModal = isGroupedView ? brandGroups.flatMap((g) => g.employees) : employees;

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

      {isGroupedView ? (
        <>
          {!isGroupsLoading && !error && brandGroups.length === 0 && (
            <EmptyStateCard
              icon={Users}
              title="No employees found"
              description="Try adjusting your filters, or add your first employee to a brand with a roster."
            />
          )}

          {isGroupsLoading && (
            <div className="space-y-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="mb-3 h-5 w-40" />
                  <EmployeeListBody
                    employees={[]}
                    isLoading
                    brands={brands}
                    departments={departments}
                    designations={designations}
                    onSelect={() => {}}
                    showBrandColumn={false}
                  />
                </div>
              ))}
            </div>
          )}

          {!isGroupsLoading &&
            brandGroups.map((group) => (
              <div key={group.brand.id}>
                <div className="mb-2.5 flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
                  <h3 className="text-sm font-semibold text-ink">{group.brand.name}</h3>
                  <span className="text-xs text-ink-muted">({group.total})</span>
                </div>
                <EmployeeListBody
                  employees={group.employees}
                  isLoading={false}
                  brands={brands}
                  departments={departments}
                  designations={designations}
                  onSelect={setSelectedEmployee}
                  showBrandColumn={false}
                />
                {group.total > GROUP_PREVIEW_LIMIT && (
                  <div className="mt-2.5 flex justify-center">
                    {group.isExpanded ? (
                      <button
                        type="button"
                        onClick={() => handleShowLess(group.brand.id)}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Show less
                      </button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => handleSeeAll(group.brand.id)}
                        isLoading={group.isLoadingMore}
                        className="!px-3 !py-1.5 !text-xs"
                      >
                        <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                        See all {group.total}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
        </>
      ) : (
        <>
          {!isLoading && !error && employees.length === 0 && (
            <EmptyStateCard
              icon={Users}
              title="No employees found"
              description="Try adjusting your filters, or add your first employee to a brand with a roster."
            />
          )}

          {(isLoading || employees.length > 0) && (
            <>
              <EmployeeListBody
                employees={employees}
                isLoading={isLoading}
                brands={brands}
                departments={departments}
                designations={designations}
                onSelect={setSelectedEmployee}
              />
              <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
            </>
          )}
        </>
      )}

      {isCreateModalOpen && (
        <EmployeeFormModal
          brands={brands}
          departments={departments}
          designations={designations}
          employees={allEmployeesForModal}
          rosterGroups={rosterGroups}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={reloadAll}
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
          employees={allEmployeesForModal}
          rosterGroups={rosterGroups}
          onClose={() => setSelectedEmployee(null)}
          onUpdated={() => {
            reloadAll();
            setSelectedEmployee(null);
          }}
          onPhotoChanged={reloadAll}
        />
      )}
    </div>
  );
}

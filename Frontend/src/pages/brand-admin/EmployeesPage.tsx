import { useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { listEmployees } from '../../api/companyAdmin/employees';
import { listBrands, listDepartments, listDesignations } from '../../api/companyAdmin/org';
import type { Brand, Department, Designation, Employee } from '../../api/tenancy';
import { EmployeeFormModal } from '../company-admin/components/EmployeeFormModal';
import { EmployeeDetailModal } from '../company-admin/components/EmployeeDetailModal';

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

// Reuses Company Admin's EmployeeFormModal/EmployeeDetailModal directly
// (rather than the old trimmed-down brand-admin modal) now that Brand Admin
// holds employee:create/update/transfer/delete — same power as Company
// Admin, scoped to their own brand. `brands={[ownBrand]}` (same trick
// ShiftsRostersPage.tsx already uses for RosterFormModal) makes the Brand
// picker in both modals resolve to a single, non-changeable option, which
// lines up with the backend's employee.service.js rejecting any transfer
// that would move an employee outside the caller's own brand.
export function EmployeesPage() {
  const { user, hasPermission } = useAuth();
  const brandId = user?.roles.find((role) => role.name === 'Brand Admin')?.brandId ?? null;
  const canCreate = hasPermission('employee:create');

  const [ownBrand, setOwnBrand] = useState<Brand | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    Promise.all([listBrands(), listDepartments(), listDesignations()])
      .then(([brands, d, des]) => {
        setOwnBrand(brands.find((b) => b.id === brandId) ?? null);
        setDepartments(d);
        setDesignations(des);
      })
      .catch(() => setError('Could not load brand/department/designation lookups.'));
  }, [brandId]);

  async function loadEmployees() {
    if (!brandId) {
      setError('No Brand is linked to this account.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await listEmployees({
        brandId,
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
  }, [brandId, departmentFilter, statusFilter, offset]);

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
        {canCreate && ownBrand && (
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
          description="Try adjusting your filters, or add your first employee to your brand with a roster."
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
                key: 'name',
                header: 'Name',
                render: (employee) => (
                  <button
                    type="button"
                    onClick={() => setSelectedEmployee(employee)}
                    className="font-medium text-ink hover:text-primary hover:underline"
                  >
                    {employee.name ?? '—'}
                  </button>
                ),
              },
              { key: 'code', header: 'Code', render: (employee) => employee.employeeCode },
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
            ]}
          />
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {isCreateModalOpen && ownBrand && (
        <EmployeeFormModal
          brands={[ownBrand]}
          departments={departments}
          designations={designations}
          employees={employees}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={loadEmployees}
          onDepartmentCreated={(department) => setDepartments((prev) => [...prev, department])}
          onDesignationCreated={(designation) => setDesignations((prev) => [...prev, designation])}
        />
      )}

      {selectedEmployee && ownBrand && (
        <EmployeeDetailModal
          employee={selectedEmployee}
          brands={[ownBrand]}
          departments={departments}
          designations={designations}
          employees={employees}
          onClose={() => setSelectedEmployee(null)}
          onUpdated={() => {
            loadEmployees();
            setSelectedEmployee(null);
          }}
        />
      )}
    </div>
  );
}

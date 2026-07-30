import { useEffect, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Select } from '../../components/ui/Select';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../context/auth-context';
import { listEmployees } from '../../api/companyAdmin/employees';
import { listBrands, listDepartments, listDesignations } from '../../api/companyAdmin/org';
import { EmployeeDetailModal } from '../company-admin/components/EmployeeDetailModal';
import type { Brand, Department, Designation, Employee } from '../../api/tenancy';

const LIMIT = 20;

// Granted via the "Document Verification" power (see Backend/src/config/
// powerCatalog.js) — lets an Employee who isn't otherwise an admin browse
// the employee directory and review/verify other employees' documents.
// Reuses Company Admin's EmployeeDetailModal as-is (same reuse pattern as
// ProvideLeavesPage/brand-admin's EmployeesPage) opened straight to its
// Documents tab; every action inside that modal is already gated on the
// real employee_document:read/verify permission codes, so a power-holder
// only ever sees what this grant actually allows.
export function DocumentVerificationPage() {
  const { hasPermission, user } = useAuth();
  const canRead = hasPermission('employee_document:read');
  const usesBrands = user?.companyUsesBrands ?? true;

  const [brands, setBrands] = useState<Brand[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [brandFilter, setBrandFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    Promise.all([listBrands(), listDepartments(), listDesignations()])
      .then(([b, d, des]) => {
        setBrands(b);
        setDepartments(d);
        setDesignations(des);
      })
      .catch(() => setError('Could not load brands/departments/designations.'));
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

  if (!canRead) {
    return <p className="text-sm text-ink-muted">You don&apos;t have access to document verification.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Select an employee below to view their uploaded documents and mark them as verified.
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
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!isLoading && !error && employees.length === 0 && (
        <EmptyStateCard
          icon={FileCheck2}
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
                key: 'name',
                header: 'Name',
                render: (employee) => (
                  <button
                    type="button"
                    onClick={() => setSelectedEmployee(employee)}
                    className="flex items-center gap-2.5 font-medium text-ink hover:text-primary hover:underline"
                  >
                    <Avatar src={employee.photoDownloadUrl} size="sm" />
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
            ]}
          />
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {selectedEmployee && (
        <EmployeeDetailModal
          employee={selectedEmployee}
          brands={brands}
          departments={departments}
          designations={designations}
          employees={employees}
          initialTab="documents"
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

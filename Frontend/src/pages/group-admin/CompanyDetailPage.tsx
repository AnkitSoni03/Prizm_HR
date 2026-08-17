import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Power, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { listEmployees, deleteEmployee } from '../../api/companyAdmin/employees';
import { ApprovalsPage } from '../company-admin/ApprovalsPage';
import { CompanyPoliciesPage } from '../company-admin/CompanyPoliciesPage';
import { EditCompanyModal } from '../super-admin/components/EditCompanyModal';
import { EmployeeDetailModal } from '../super-admin/components/EmployeeDetailModal';
import {
  deleteBrand,
  deleteCompany,
  getCompany,
  listBrands,
  listPlans,
  updateCompany,
  type Brand,
  type Company,
  type Employee,
  type Plan,
} from '../../api/tenancy';

type Tab = 'employees' | 'brands' | 'approvals' | 'policies';

// A company is still receiving service under 'trial'/'grace'/'active' — the
// toggle only ever flips between 'active' and 'suspended' ("stop billing
// service without touching data"), same convention as Super Admin's
// CompanyCard.tsx; 'terminated' is a harder-stop status not exposed here.
const INACTIVE_STATUSES = new Set<Company['status']>(['suspended', 'terminated']);

function companyStatusTone(status: Company['status']) {
  if (status === 'active') return 'success';
  if (status === 'trial' || status === 'grace') return 'warning';
  return 'danger';
}

// Full-page replacement for the old CompanyDetailModal popup — mirrors
// super-admin/CompanyDetailPage.tsx's shell (back-link, header card, Tabs).
// Group Admin now holds company:delete/company:suspend/brand:delete/
// employee:delete scoped to their own Group (backend: company.controller.js
// ::update/remove, brand.service.js::getBrandForWrite, employee.service.js
// ::getEmployeeForWrite all enforce this) — Approvals/Policies stay
// read-only as before (no *:approve/*:reject or employee:create granted).
export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const canEdit = hasPermission('company:update');
  const canToggleStatus = hasPermission('company:suspend');
  const canDeleteCompany = hasPermission('company:delete');
  const canDeleteBrand = hasPermission('brand:delete');
  const canDeleteEmployee = hasPermission('employee:delete');

  const [activeTab, setActiveTab] = useState<Tab>('employees');
  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isLoadingBrands, setIsLoadingBrands] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const isServing = company ? !INACTIVE_STATUSES.has(company.status) : true;

  async function loadCompany(companyId: string) {
    setIsLoading(true);
    setError(null);
    try {
      const [companyRow, planRows] = await Promise.all([getCompany(companyId), listPlans()]);
      setCompany(companyRow);
      setPlans(planRows);
    } catch {
      setError('Could not load this company.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCompany(id);
  }, [id]);

  useEffect(() => {
    if (!id || activeTab !== 'employees') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingEmployees(true);
    setError(null);
    listEmployees({ companyId: id, limit: 100 })
      .then((result) => setEmployees(result.data))
      .catch(() => setError('Could not load employees for this company.'))
      .finally(() => setIsLoadingEmployees(false));
  }, [id, activeTab]);

  // Loaded unconditionally (not gated to the Brands tab) — the Employees
  // tab's own detail view needs brand names to resolve each employee's
  // Brand, and this list is small/cheap enough that eager-loading it
  // alongside the company itself is simpler than fetching it twice.
  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingBrands(true);
    setError(null);
    listBrands(id)
      .then(setBrands)
      .catch(() => setError('Could not load brands for this company.'))
      .finally(() => setIsLoadingBrands(false));
  }, [id]);

  async function handleToggleStatus() {
    if (!company) return;
    const nextStatus: Company['status'] = isServing ? 'suspended' : 'active';
    const confirmed = await confirm({
      title: isServing ? 'Deactivate company' : 'Activate company',
      message: isServing
        ? `Deactivate "${company.name}"? Every user in this company will immediately lose access until it's reactivated. No data is deleted.`
        : `Activate "${company.name}"? All of its users will regain access immediately.`,
      confirmLabel: isServing ? 'Deactivate' : 'Activate',
      variant: isServing ? 'danger' : 'primary',
    });
    if (!confirmed) return;
    setIsTogglingStatus(true);
    try {
      const updated = await updateCompany(company.id, { status: nextStatus });
      setCompany(updated);
    } catch {
      showToast("Could not update this company's status. Please try again.");
    } finally {
      setIsTogglingStatus(false);
    }
  }

  async function handleDeleteCompany() {
    if (!company) return;
    const confirmed = await confirm({
      title: 'Delete company',
      message: `Delete "${company.name}"? This cannot be undone — it only works if no brands, employees, or users still belong to it.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    setIsDeletingCompany(true);
    try {
      await deleteCompany(company.id);
      navigate('/group-admin/companies');
    } catch {
      showToast('Could not delete this company — it may still have active brands, employees, or users.');
      setIsDeletingCompany(false);
    }
  }

  async function handleDeleteBrand(brand: Brand) {
    if (!id) return;
    const confirmed = await confirm({
      title: 'Delete brand',
      message: `Delete brand "${brand.name}"? This cannot be undone — it only works if no employees are still assigned to it.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeletingBrandId(brand.id);
    try {
      await deleteBrand(brand.id);
      setBrands(await listBrands(id));
    } catch {
      showToast('Could not delete this brand — it may still have employees assigned.');
    } finally {
      setDeletingBrandId(null);
    }
  }

  async function handleDeleteEmployee(employee: Employee) {
    if (!id) return;
    const confirmed = await confirm({
      title: 'Delete employee',
      message: `Permanently delete "${employee.name ?? employee.employeeCode}"? This cannot be undone — their entire record is removed, not just deactivated.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeletingEmployeeId(employee.id);
    try {
      await deleteEmployee(employee.id);
      const result = await listEmployees({ companyId: id, limit: 100 });
      setEmployees(result.data);
    } catch {
      showToast('Could not delete this employee. Please try again.');
    } finally {
      setDeletingEmployeeId(null);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading company…</p>;
  }

  if (error || !company) {
    return <p className="text-sm text-danger">{error ?? 'Company not found.'}</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/group-admin/companies')}
        className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to Companies
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold text-ink">{company.name}</h2>
          <p className="text-sm text-ink-muted">
            {company.legalName ?? '—'}
            {company.gstNumber ? ` · GST ${company.gstNumber}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={companyStatusTone(company.status)}>{company.status}</Badge>
          {canToggleStatus && (
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={isTogglingStatus}
              aria-label={isServing ? `Deactivate ${company.name}` : `Activate ${company.name}`}
              title={isServing ? 'Deactivate company' : 'Activate company'}
              className={
                isServing
                  ? 'rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50'
                  : 'rounded-md p-1.5 text-ink-muted hover:bg-success/10 hover:text-success disabled:opacity-50'
              }
            >
              <Power className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              aria-label={`Edit ${company.name}`}
              title="Edit Company"
              className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          {canDeleteCompany && (
            <button
              type="button"
              onClick={handleDeleteCompany}
              disabled={isDeletingCompany}
              aria-label={`Delete ${company.name}`}
              title="Delete Company"
              className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <Tabs
        items={[
          { key: 'employees', label: 'Employees' },
          { key: 'brands', label: 'Brands' },
          { key: 'approvals', label: 'Approvals' },
          { key: 'policies', label: 'Company Policies' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {activeTab === 'employees' && (
        <Table
          isLoading={isLoadingEmployees}
          rows={employees}
          rowKey={(employee) => employee.id}
          emptyMessage="No employees found for this company."
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (e) => (
                <button
                  type="button"
                  onClick={() => setSelectedEmployee(e)}
                  className="font-medium text-ink hover:text-primary hover:underline"
                >
                  {e.name ?? '—'}
                </button>
              ),
            },
            { key: 'code', header: 'Code', render: (e) => e.employeeCode },
            { key: 'employmentType', header: 'Type', render: (e) => e.employmentType },
            {
              key: 'status',
              header: 'Status',
              render: (e) => <Badge tone={e.status === 'active' ? 'success' : 'neutral'}>{e.status}</Badge>,
            },
            {
              key: 'actions',
              header: '',
              className: 'w-16 text-right',
              render: (e) =>
                canDeleteEmployee && (
                  <button
                    type="button"
                    onClick={() => handleDeleteEmployee(e)}
                    disabled={deletingEmployeeId === e.id}
                    aria-label={`Delete ${e.name ?? e.employeeCode}`}
                    className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                ),
            },
          ]}
        />
      )}

      {activeTab === 'brands' && (
        <Table
          isLoading={isLoadingBrands}
          rows={brands}
          rowKey={(brand) => brand.id}
          emptyMessage="No brands found for this company."
          columns={[
            { key: 'name', header: 'Name', render: (b) => b.name },
            { key: 'code', header: 'Code', render: (b) => b.code ?? '—' },
            {
              key: 'location',
              header: 'Location',
              render: (b) => [b.city, b.state].filter(Boolean).join(', ') || '—',
            },
            {
              key: 'status',
              header: 'Status',
              render: (b) => <Badge tone={b.isActive ? 'success' : 'neutral'}>{b.isActive ? 'active' : 'inactive'}</Badge>,
            },
            {
              key: 'actions',
              header: '',
              className: 'w-16 text-right',
              render: (b) =>
                canDeleteBrand && (
                  <button
                    type="button"
                    onClick={() => handleDeleteBrand(b)}
                    disabled={deletingBrandId === b.id}
                    aria-label={`Delete ${b.name}`}
                    className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                ),
            },
          ]}
        />
      )}

      {activeTab === 'approvals' && <ApprovalsPage extraParams={{ companyId: company.id }} />}

      {activeTab === 'policies' && <CompanyPoliciesPage extraParams={{ companyId: company.id }} />}

      {isEditModalOpen && (
        <EditCompanyModal
          company={company}
          plans={plans}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={() => loadCompany(company.id)}
        />
      )}

      {selectedEmployee && (
        <EmployeeDetailModal
          employee={selectedEmployee}
          companyName={company.name}
          brandName={brands.find((b) => b.id === selectedEmployee.brandId)?.name ?? null}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

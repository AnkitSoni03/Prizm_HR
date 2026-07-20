import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/auth-context';
import { CreateBrandModal } from './components/CreateBrandModal';
import { EditCompanyModal } from './components/EditCompanyModal';
import { BrandCard } from './components/BrandCard';
import { DepartmentFormModal } from './components/DepartmentFormModal';
import { DesignationFormModal } from './components/DesignationFormModal';
import {
  deleteDepartment,
  deleteDesignation,
  getCompany,
  getRosterCount,
  listBrands,
  listDepartments,
  listDesignations,
  listPlans,
  listShifts,
  type Brand,
  type Company,
  type Department,
  type Designation,
  type Plan,
  type Shift,
} from '../../api/tenancy';

// Key rosterCounts is stored under for a brand-less company's single
// company-level roster panel (there's no brand.id to key it by) — mirrors
// the same convention the old inline CompanyCard used.
const COMPANY_LEVEL_KEY = '__company__';

type Tab = 'brands' | 'departments' | 'designations';

function companyStatusTone(status: Company['status']) {
  if (status === 'active') return 'success';
  if (status === 'trial' || status === 'grace') return 'warning';
  return 'danger';
}

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('brands');
  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [rosterCounts, setRosterCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | 'new' | null>(null);
  const [editingDesignation, setEditingDesignation] = useState<Designation | 'new' | null>(null);

  const canCreateBrand = hasPermission('brand:create');
  const canManageShifts = hasPermission('shift:create');
  const canCreateRoster = hasPermission('shift_roster:create');
  const canManageDepartments = hasPermission('department:create');
  const canManageDesignations = hasPermission('designation:create');
  const canCreateEmployee = hasPermission('employee:create');
  const canEditBrand = hasPermission('brand:update');
  const canEditCompany = hasPermission('company:update');

  const planName = plans.find((plan) => plan.id === company?.planId)?.name ?? '—';

  async function loadShifts(companyId: string) {
    try {
      setShifts(await listShifts(companyId));
    } catch {
      // Feeds the roster-creation dropdown; a failure here still leaves the
      // rest of the page usable.
    }
  }

  async function loadDepartments(companyId: string) {
    try {
      setDepartments(await listDepartments(companyId));
    } catch {
      // Same rationale as loadShifts — feeds the Add Employee dropdown.
    }
  }

  async function loadDesignations(companyId: string) {
    try {
      setDesignations(await listDesignations(companyId));
    } catch {
      // Same rationale as loadShifts — feeds the Add Employee dropdown.
    }
  }

  async function loadBrands(targetCompany: Company) {
    if (targetCompany.usesBrands) {
      const rows = await listBrands(targetCompany.id);
      setBrands(rows);
      const counts = await Promise.all(
        rows.map((brand) => getRosterCount({ companyId: targetCompany.id, brandId: brand.id }))
      );
      setRosterCounts(Object.fromEntries(rows.map((brand, i) => [brand.id, counts[i]])));
    } else {
      setBrands([]);
      const count = await getRosterCount({ companyId: targetCompany.id });
      setRosterCounts({ [COMPANY_LEVEL_KEY]: count });
    }
  }

  async function refreshRosterCount(companyId: string, brandId?: string) {
    const count = await getRosterCount({ companyId, brandId });
    setRosterCounts((prev) => ({ ...prev, [brandId ?? COMPANY_LEVEL_KEY]: count }));
  }

  async function loadAll(companyId: string) {
    setIsLoading(true);
    setError(null);
    try {
      const [companyRow, planRows] = await Promise.all([getCompany(companyId), listPlans()]);
      setCompany(companyRow);
      setPlans(planRows);
      await Promise.all([loadShifts(companyId), loadDepartments(companyId), loadDesignations(companyId)]);
      await loadBrands(companyRow);
    } catch {
      setError('Could not load this company.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDeleteDepartment(department: Department) {
    if (!company) return;
    if (!window.confirm(`Delete department "${department.name}"? This cannot be undone.`)) return;
    try {
      await deleteDepartment(department.id, company.id);
      loadDepartments(company.id);
    } catch {
      window.alert('Could not delete this department — it may still have employees assigned.');
    }
  }

  async function handleDeleteDesignation(designation: Designation) {
    if (!company) return;
    if (!window.confirm(`Delete designation "${designation.title}"? This cannot be undone.`)) return;
    try {
      await deleteDesignation(designation.id, company.id);
      loadDesignations(company.id);
    } catch {
      window.alert('Could not delete this designation — it may still have employees assigned.');
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
        onClick={() => navigate('/super-admin/companies')}
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
            {company.gstNumber ? ` · GST ${company.gstNumber}` : ''} · Plan: {planName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={companyStatusTone(company.status)}>{company.status}</Badge>
          {canEditCompany && (
            <button
              type="button"
              onClick={() => setIsEditCompanyModalOpen(true)}
              aria-label={`Edit ${company.name}`}
              title="Edit Company"
              className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <Tabs
        items={[
          { key: 'brands', label: company.usesBrands ? 'Brands' : 'Roster & Employees' },
          { key: 'departments', label: 'Departments' },
          { key: 'designations', label: 'Designations' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {activeTab === 'brands' && (
        <div>
          {company.usesBrands ? (
            <>
              {brands?.length === 0 && <p className="text-sm text-ink-muted">No brands yet.</p>}
              {brands && brands.length > 0 && (
                <div className="space-y-2">
                  {brands.map((brand) => (
                    <BrandCard
                      key={brand.id}
                      brand={brand}
                      companyId={company.id}
                      shifts={shifts}
                      departments={departments}
                      designations={designations}
                      rosterCount={rosterCounts[brand.id] ?? 0}
                      canManageShifts={canManageShifts}
                      canCreateRoster={canCreateRoster}
                      canCreateEmployee={canCreateEmployee}
                      canEdit={canEditBrand}
                      onShiftsChanged={() => loadShifts(company.id)}
                      onRosterCreated={() => refreshRosterCount(company.id, brand.id)}
                      onBrandSaved={() => loadBrands(company)}
                      onDepartmentCreated={(department) => setDepartments((prev) => [...prev, department])}
                      onDesignationCreated={(designation) => setDesignations((prev) => [...prev, designation])}
                    />
                  ))}
                </div>
              )}

              {canCreateBrand && (
                <Button variant="secondary" className="mt-3" onClick={() => setIsBrandModalOpen(true)}>
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                  Add Brand
                </Button>
              )}
            </>
          ) : (
            <BrandCard
              brand={null}
              companyId={company.id}
              shifts={shifts}
              departments={departments}
              designations={designations}
              rosterCount={rosterCounts[COMPANY_LEVEL_KEY] ?? 0}
              canManageShifts={canManageShifts}
              canCreateRoster={canCreateRoster}
              canCreateEmployee={canCreateEmployee}
              canEdit={false}
              onShiftsChanged={() => loadShifts(company.id)}
              onRosterCreated={() => refreshRosterCount(company.id)}
              onBrandSaved={() => loadBrands(company)}
              onDepartmentCreated={(department) => setDepartments((prev) => [...prev, department])}
              onDesignationCreated={(designation) => setDesignations((prev) => [...prev, designation])}
            />
          )}
        </div>
      )}

      {activeTab === 'departments' && (
        <div>
          {canManageDepartments && (
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" onClick={() => setEditingDepartment('new')}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add Department
              </Button>
            </div>
          )}
          {departments.length === 0 && <p className="text-sm text-ink-muted">No departments defined yet.</p>}
          {departments.length > 0 && (
            <div className="space-y-2">
              {departments.map((department) => (
                <div
                  key={department.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{department.name}</p>
                    {department.code && <p className="text-xs text-ink-muted">Code: {department.code}</p>}
                  </div>
                  {canManageDepartments && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingDepartment(department)}
                        aria-label={`Edit ${department.name}`}
                        className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDepartment(department)}
                        aria-label={`Delete ${department.name}`}
                        className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'designations' && (
        <div>
          {canManageDesignations && (
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" onClick={() => setEditingDesignation('new')}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add Designation
              </Button>
            </div>
          )}
          {designations.length === 0 && <p className="text-sm text-ink-muted">No designations defined yet.</p>}
          {designations.length > 0 && (
            <div className="space-y-2">
              {designations.map((designation) => (
                <div
                  key={designation.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{designation.title}</p>
                  </div>
                  {canManageDesignations && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingDesignation(designation)}
                        aria-label={`Edit ${designation.title}`}
                        className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDesignation(designation)}
                        aria-label={`Delete ${designation.title}`}
                        className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isBrandModalOpen && (
        <CreateBrandModal
          companyId={company.id}
          onClose={() => setIsBrandModalOpen(false)}
          onCreated={() => loadBrands(company)}
        />
      )}

      {isEditCompanyModalOpen && (
        <EditCompanyModal
          company={company}
          plans={plans}
          onClose={() => setIsEditCompanyModalOpen(false)}
          onSaved={() => loadAll(company.id)}
        />
      )}

      {editingDepartment && (
        <DepartmentFormModal
          companyId={company.id}
          department={editingDepartment === 'new' ? undefined : editingDepartment}
          onClose={() => setEditingDepartment(null)}
          onSaved={() => loadDepartments(company.id)}
        />
      )}

      {editingDesignation && (
        <DesignationFormModal
          companyId={company.id}
          designation={editingDesignation === 'new' ? undefined : editingDesignation}
          onClose={() => setEditingDesignation(null)}
          onSaved={() => loadDesignations(company.id)}
        />
      )}
    </div>
  );
}

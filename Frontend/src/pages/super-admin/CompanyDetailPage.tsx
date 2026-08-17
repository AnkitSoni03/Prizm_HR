import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { CreateBrandModal } from './components/CreateBrandModal';
import { EditCompanyModal } from './components/EditCompanyModal';
import { BrandCard } from './components/BrandCard';
import {
  deleteCompany,
  getCompany,
  listBrands,
  listPlans,
  type Brand,
  type Company,
  type Plan,
} from '../../api/tenancy';

function companyStatusTone(status: Company['status']) {
  if (status === 'active') return 'success';
  if (status === 'trial' || status === 'grace') return 'warning';
  return 'danger';
}

// Super Admin's scope on a company is deliberately minimal: Brands and
// employees (created by name only). Departments, Designations, Shifts, and
// Rosters are all Company Admin's job now, done later from the Company
// Admin portal — this page no longer manages any of them.
export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);

  const canCreateBrand = hasPermission('brand:create');
  const canCreateEmployee = hasPermission('employee:create');
  const canDeleteEmployee = hasPermission('employee:delete');
  const canEditBrand = hasPermission('brand:update');
  const canDeleteBrand = hasPermission('brand:delete');
  const canEditCompany = hasPermission('company:update');
  const canDeleteCompany = hasPermission('company:delete');

  const planName = plans.find((plan) => plan.id === company?.planId)?.name ?? '—';

  async function loadBrands(targetCompany: Company) {
    if (targetCompany.usesBrands) {
      setBrands(await listBrands(targetCompany.id));
    } else {
      setBrands([]);
    }
  }

  async function loadAll(companyId: string) {
    setIsLoading(true);
    setError(null);
    try {
      const [companyRow, planRows] = await Promise.all([getCompany(companyId), listPlans()]);
      setCompany(companyRow);
      setPlans(planRows);
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
      navigate('/super-admin/companies');
    } catch {
      showToast('Could not delete this company — it may still have active brands, employees, or users.');
      setIsDeletingCompany(false);
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

      <h3 className="mb-3 text-sm font-semibold text-ink">
        {company.usesBrands ? 'Brands' : 'Employees'}
      </h3>

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
                  canCreateEmployee={canCreateEmployee}
                  canDeleteEmployee={canDeleteEmployee}
                  canEdit={canEditBrand}
                  canDelete={canDeleteBrand}
                  onBrandSaved={() => loadBrands(company)}
                  onBrandDeleted={() => loadBrands(company)}
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
          canCreateEmployee={canCreateEmployee}
          canDeleteEmployee={canDeleteEmployee}
          canEdit={false}
          canDelete={false}
          onBrandSaved={() => loadBrands(company)}
          onBrandDeleted={() => loadBrands(company)}
        />
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
    </div>
  );
}

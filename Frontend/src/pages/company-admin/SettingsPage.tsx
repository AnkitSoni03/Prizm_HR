import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, ShieldAlert } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { useAuth } from '../../context/auth-context';
import { EditCompanyModal } from '../super-admin/components/EditCompanyModal';
import { getCompany, listPlans, updateCompany, type Company, type Plan } from '../../api/tenancy';
import { useToast } from '../../context/toast-context';

type Tab = 'profile' | 'password';

function companyStatusTone(status: Company['status']) {
  if (status === 'active') return 'success';
  if (status === 'trial' || status === 'grace') return 'warning';
  return 'danger';
}

// Company Admin never had a way to fix up their own company's profile
// (name/legal name/GST/plan) despite already holding company:update in
// RBAC — this is the first UI surface for it, reusing the same
// EditCompanyModal the Super Admin and Group Admin portals use. Status
// changes stay hidden inside that modal (company:suspend is Super-Admin-
// only), so this page is deliberately silent about lifecycle status too.
export function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const showToast = useToast();
  const [searchParams] = useSearchParams();
  const initialTab: Tab = searchParams.get('tab') === 'password' ? 'password' : 'profile';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const canEdit = hasPermission('company:update');
  const companyId = user?.roles.find((role) => role.companyId)?.companyId ?? null;

  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingAntispoof, setIsSavingAntispoof] = useState(false);

  async function toggleAntispoofEnforcement(enabled: boolean) {
    if (!company) return;
    setIsSavingAntispoof(true);
    try {
      const updated = await updateCompany(company.id, { faceAntispoofEnforced: enabled });
      setCompany(updated);
      showToast(enabled ? 'Fraud detection is now blocking check-ins.' : 'Fraud detection is back to review-only mode.', 'success');
    } catch {
      showToast('Could not update this setting.', 'error');
    } finally {
      setIsSavingAntispoof(false);
    }
  }

  async function loadCompany(id: string) {
    setIsLoading(true);
    setError(null);
    try {
      const [companyRow, planRows] = await Promise.all([getCompany(id), listPlans()]);
      setCompany(companyRow);
      setPlans(planRows);
    } catch {
      setError('Could not load your company profile.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!companyId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCompany(companyId);
  }, [companyId]);

  const planName = plans.find((plan) => plan.id === company?.planId)?.name ?? '—';

  return (
    <div className="max-w-2xl space-y-6">
      <Tabs
        items={[
          { key: 'profile', label: 'Profile' },
          { key: 'password', label: 'Reset Password' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {activeTab === 'profile' && (
        <div className="space-y-6">
          {!companyId && <p className="text-sm text-danger">Could not determine your company.</p>}
          {companyId && isLoading && <p className="text-sm text-ink-muted">Loading company profile…</p>}
          {companyId && !isLoading && (error || !company) && (
            <p className="text-sm text-danger">{error ?? 'Company not found.'}</p>
          )}

          {companyId && !isLoading && company && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-ink">{company.name}</h2>
                  <p className="text-sm text-ink-muted">
                    {company.legalName ?? '—'}
                    {company.gstNumber ? ` · GST ${company.gstNumber}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={companyStatusTone(company.status)}>{company.status}</Badge>
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
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-page px-4 py-3 text-sm">
                <p className="text-ink-muted">Legal Name</p>
                <p className="text-ink">{company.legalName ?? '—'}</p>
                <p className="text-ink-muted">GST Number</p>
                <p className="text-ink">{company.gstNumber ?? '—'}</p>
                <p className="text-ink-muted">Plan</p>
                <p className="text-ink">{planName}</p>
                <p className="text-ink-muted">Organization Mode</p>
                <p className="text-ink">{company.usesBrands ? 'Brands' : 'Direct (no Brands)'}</p>
              </div>
            </div>
          )}

          {companyId && !isLoading && company && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" strokeWidth={1.75} />
                <div>
                  <h2 className="text-lg font-semibold text-ink">Kiosk Fraud Detection</h2>
                  <p className="text-sm text-ink-muted">
                    The kiosk anti-spoof check always runs and logs suspicious attempts to{' '}
                    <span className="font-medium text-ink">Fraud Attempts</span>. Turn this on once you've confirmed
                    real employees aren't being falsely flagged there — from then on, a detected photo, video, or
                    screen is rejected outright instead of just logged.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary disabled:opacity-50"
                  checked={company.faceAntispoofEnforced}
                  disabled={!canEdit || isSavingAntispoof}
                  onChange={(event) => toggleAntispoofEnforcement(event.target.checked)}
                />
                <span className="text-ink">
                  {company.faceAntispoofEnforced ? 'Blocking suspicious check-ins' : 'Review-only (not blocking check-ins yet)'}
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {activeTab === 'password' && <ChangePasswordCard />}

      {isEditModalOpen && company && (
        <EditCompanyModal
          company={company}
          plans={plans}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={() => loadCompany(company.id)}
        />
      )}
    </div>
  );
}

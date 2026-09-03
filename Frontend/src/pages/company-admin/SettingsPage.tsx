import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, CreditCard, Hash, Layers, Lock, MonitorSmartphone, Pencil, ShieldAlert, User } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { DetailRow } from '../../components/ui/DetailRow';
import { AccountProfileCard } from '../../components/AccountProfileCard';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { useAuth } from '../../context/auth-context';
import { EditCompanyModal } from '../super-admin/components/EditCompanyModal';
import { getCompany, listPlans, updateCompany, type Company, type Plan } from '../../api/tenancy';
import { useToast } from '../../context/toast-context';
import { ScannerAccountsPage } from './ScannerAccountsPage';

type Tab = 'profile' | 'password' | 'kiosks';

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
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab =
    requestedTab === 'password' ? 'password' : requestedTab === 'kiosks' ? 'kiosks' : 'profile';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const canEdit = hasPermission('company:update');
  const canManageKiosks = hasPermission('scanner_account:create');
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
    // Kiosk Accounts' table needs the full page width, unlike the
    // profile/password cards below it — only those two stay capped.
    <div className={activeTab === 'kiosks' ? 'space-y-6' : 'max-w-2xl space-y-6'}>
      <Tabs
        items={[
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'password', label: 'Reset Password', icon: Lock },
          ...(canManageKiosks ? [{ key: 'kiosks', label: 'Kiosk Accounts', icon: MonitorSmartphone }] : []),
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {activeTab === 'profile' && (
        <div className="space-y-6">
          <AccountProfileCard />

          {!companyId && <p className="text-sm text-danger">Could not determine your company.</p>}
          {companyId && isLoading && <p className="text-sm text-ink-muted">Loading company profile…</p>}
          {companyId && !isLoading && (error || !company) && (
            <p className="text-sm text-danger">{error ?? 'Company not found.'}</p>
          )}

          {companyId && !isLoading && company && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
                    <Building2 className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-ink">{company.name}</h2>
                    <p className="text-sm text-ink-muted">Company Profile</p>
                  </div>
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

              <div className="space-y-2.5 border-t border-border pt-3.5">
                <DetailRow icon={Building2} label="Legal Name" value={company.legalName ?? '—'} />
                <DetailRow icon={Hash} label="GST Number" value={company.gstNumber ?? '—'} />
                <DetailRow icon={CreditCard} label="Plan" value={planName} />
                <DetailRow icon={Layers} label="Organization Mode" value={company.usesBrands ? 'Brands' : 'Direct (no Brands)'} />
              </div>
            </div>
          )}

          {companyId && !isLoading && company && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                  <ShieldAlert className="h-5 w-5" strokeWidth={1.75} />
                </div>
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
              <label className="flex items-center gap-3 border-t border-border pt-3.5 text-sm">
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

      {activeTab === 'kiosks' && canManageKiosks && <ScannerAccountsPage />}

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

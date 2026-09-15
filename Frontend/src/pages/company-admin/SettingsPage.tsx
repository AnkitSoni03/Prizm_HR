import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, CreditCard, Hash, Layers, Lock, ShieldCheck, User } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { AccountProfileCard } from '../../components/AccountProfileCard';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { useAuth } from '../../context/auth-context';
import { getCompany, listPlans, type Company, type Plan } from '../../api/tenancy';

type Tab = 'profile' | 'password';

function companyStatusTone(status: Company['status']) {
  if (status === 'active') return 'success';
  if (status === 'trial' || status === 'grace') return 'warning';
  return 'danger';
}

interface InfoTileProps {
  icon: typeof Building2;
  label: string;
  value: string;
}

// Read-only label/value row — one plain row per field, all living inside a
// single shared container (see the divide-y wrapper below) rather than each
// field getting its own separate boxed div.
function InfoTile({ icon: Icon, label, value }: InfoTileProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="ml-auto truncate text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

// The company profile section (legal name/GST/plan/organization mode) is
// read-only here by design — those are platform-level facts set up by the
// Super Admin at onboarding, not something a Company Admin self-serves.
// Only the account's own photo/display name (AccountProfileCard) are
// editable on this page.
export function SettingsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = requestedTab === 'password' ? 'password' : 'profile';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const companyId = user?.roles.find((role) => role.companyId)?.companyId ?? null;

  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-6">
      <Tabs
        items={[
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'password', label: 'Reset Password', icon: Lock },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {activeTab === 'profile' && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <AccountProfileCard bare />

          {!companyId && <p className="mt-6 text-sm text-danger">Could not determine your company.</p>}
          {companyId && isLoading && <p className="mt-6 text-sm text-ink-muted">Loading company profile…</p>}
          {companyId && !isLoading && (error || !company) && (
            <p className="mt-6 text-sm text-danger">{error ?? 'Company not found.'}</p>
          )}

          {companyId && !isLoading && company && (
            <div className="mt-6 border-t border-border pt-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-light text-primary">
                    <Building2 className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-ink">{company.name}</h2>
                    <p className="text-sm text-ink-muted">Company Profile</p>
                  </div>
                </div>
                <Badge tone={companyStatusTone(company.status)}>{company.status}</Badge>
              </div>

              <div className="divide-y divide-border rounded-xl border border-border">
                <InfoTile icon={Building2} label="Legal Name" value={company.legalName ?? '—'} />
                <InfoTile icon={Hash} label="GST Number" value={company.gstNumber ?? '—'} />
                <InfoTile icon={CreditCard} label="Plan" value={planName} />
                <InfoTile
                  icon={Layers}
                  label="Organization Mode"
                  value={company.usesBrands ? 'Brands' : 'Direct (no Brands)'}
                />
              </div>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed border-border px-3.5 py-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
                <p className="text-xs text-ink-muted">
                  These details are set up by your Super Admin and shown here as read-only. Reach out to
                  them for any changes.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'password' && <ChangePasswordCard />}
    </div>
  );
}

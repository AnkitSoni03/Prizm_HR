import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, MonitorSmartphone, ShieldAlert, User } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { AccountProfileCard } from '../../components/AccountProfileCard';
import { ChangePasswordCard } from '../../components/ChangePasswordCard';
import { ScannerAccountsPage } from '../company-admin/ScannerAccountsPage';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { getCompany, updateCompany, type Company } from '../../api/tenancy';

type Tab = 'profile' | 'password' | 'kiosks';

// Fraud detection is company-wide (companies.face_antispoof_enforced has no
// brand dimension — same as every other statutory/security-level setting),
// so toggling it here affects every Brand's kiosks, not just this Brand
// Admin's own. Reachable at all because Brand Admin was given full
// company:read/company:update parity with Company Admin (explicit ask, see
// 20260831093000-seed-brand-admin-company-admin-parity.js) — this reuses
// that grant rather than needing a new narrower permission. Placed on the
// Kiosk Accounts tab (not Profile, which here is just this admin's own
// personal account card) since it's specifically about kiosk behavior.
export function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const showToast = useToast();
  const canManageKiosks = hasPermission('scanner_account:create');
  const canEditAntispoof = hasPermission('company:update');
  const companyId = user?.roles.find((role) => role.companyId)?.companyId ?? null;

  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab =
    requestedTab === 'password' ? 'password' : requestedTab === 'kiosks' ? 'kiosks' : 'profile';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoadingCompany, setIsLoadingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [isSavingAntispoof, setIsSavingAntispoof] = useState(false);

  useEffect(() => {
    if (!companyId || !canManageKiosks) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingCompany(true);
    getCompany(companyId)
      .then(setCompany)
      .catch(() => setCompanyError('Could not load fraud detection settings.'))
      .finally(() => setIsLoadingCompany(false));
  }, [companyId, canManageKiosks]);

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

  return (
    <div>
      <Tabs
        items={[
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'password', label: 'Reset Password', icon: Lock },
          ...(canManageKiosks ? [{ key: 'kiosks', label: 'Kiosk Accounts', icon: MonitorSmartphone }] : []),
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />
      {activeTab === 'profile' && <AccountProfileCard />}
      {activeTab === 'password' && <ChangePasswordCard />}
      {activeTab === 'kiosks' && canManageKiosks && (
        <div className="space-y-6">
          {isLoadingCompany && <p className="text-sm text-ink-muted">Loading fraud detection settings…</p>}
          {!isLoadingCompany && companyError && <p className="text-sm text-danger">{companyError}</p>}

          {!isLoadingCompany && company && (
            <div className="max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-sm">
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
                    screen is rejected outright instead of just logged. Applies company-wide, across every Brand's
                    kiosks.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-3 border-t border-border pt-3.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary disabled:opacity-50"
                  checked={company.faceAntispoofEnforced}
                  disabled={!canEditAntispoof || isSavingAntispoof}
                  onChange={(event) => toggleAntispoofEnforcement(event.target.checked)}
                />
                <span className="text-ink">
                  {company.faceAntispoofEnforced ? 'Blocking suspicious check-ins' : 'Review-only (not blocking check-ins yet)'}
                </span>
              </label>
            </div>
          )}

          <ScannerAccountsPage />
        </div>
      )}
    </div>
  );
}

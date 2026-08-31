import { useEffect, useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff, KeyRound, Loader2, Lock, MonitorSmartphone, Plus } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import {
  createScannerAccount,
  getScannerAccountPassword,
  listScannerAccounts,
  resetScannerAccountPassword,
  type ScannerAccount,
} from '../../api/companyAdmin/scannerAccounts';
import { formatDisplayDate } from '../../utils/dateDisplay';

const MASKED_PASSWORD = '••••••••';

// One cell's worth of reveal-on-demand state, kept local to the row instead
// of one big map on the parent page — each kiosk's password is only ever
// fetched (and decrypted server-side) the moment someone actually clicks
// its eye icon, never preloaded for the whole list. Once fetched it's
// cached for the rest of this page view so toggling hide/show again doesn't
// re-fetch; a full reload starts masked again.
function PasswordCell({ account, canReveal }: { account: ScannerAccount; canReveal: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState<string | null | undefined>(undefined); // undefined = not fetched yet
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  async function toggle() {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (password !== undefined) {
      setRevealed(true);
      return;
    }
    setIsLoading(true);
    setLoadError(false);
    try {
      const result = await getScannerAccountPassword(account.id);
      setPassword(result);
      setRevealed(true);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }

  if (!canReveal) {
    return <span className="font-mono text-sm text-ink-muted">{MASKED_PASSWORD}</span>;
  }

  let displayText = MASKED_PASSWORD;
  if (revealed) {
    displayText = password ?? 'Not available — reset password to enable';
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`font-mono text-sm ${revealed && !password ? 'italic text-ink-muted' : 'text-ink'}`}>
        {displayText}
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={isLoading}
        aria-label={revealed ? `Hide password for ${account.email}` : `Show password for ${account.email}`}
        title={revealed ? 'Hide password' : 'Show password'}
        className="text-ink-muted hover:text-primary disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
        ) : revealed ? (
          <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} />
        ) : (
          <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
      </button>
      {loadError && <span className="text-xs text-danger">Could not load</span>}
    </div>
  );
}

// Reused as-is by both /company-admin/scanner-accounts and
// /brand-admin/scanner-accounts (same pattern as OrganizationPage/
// HolidaysPage). The backend's scanner_account:create grant is brand-scoped
// for Brand Admin and requires brandId to be sent explicitly (it's never
// auto-filled from the caller's own grant — same "omitted brandId must not
// silently fall through" rule employee/roster create already follow), so
// this page resolves the caller's own brandId the same way
// EmployeesPage/ShiftsRostersPage/ApprovalsPage do and threads it through
// both list (avoids leaking every brand's kiosk accounts to a Brand Admin)
// and create (avoids the 403 a Brand Admin previously got with no brandId).
export function ScannerAccountsPage() {
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission('scanner_account:create');
  const ownBrandId = user?.roles.find((role) => role.name === 'Brand Admin')?.brandId ?? null;

  const [accounts, setAccounts] = useState<ScannerAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<ScannerAccount | null>(null);
  // Bumped for one account id whenever its password is reset — used as part
  // of that row's PasswordCell `key` below, forcing a fresh mount (and so a
  // fresh state.password of `undefined`) instead of silently going on
  // showing a cached, now-stale plaintext from before the reset.
  const [passwordVersion, setPasswordVersion] = useState<Record<string, number>>({});

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listScannerAccounts(ownBrandId ? { brandId: ownBrandId } : {});
      setAccounts(result);
    } catch {
      setError('Could not load kiosk accounts.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownBrandId]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Each physical attendance kiosk signs in with its own account below.
        </p>
        {canCreate && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Kiosk Account
          </Button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && accounts.length === 0 && (
        <EmptyStateCard
          icon={MonitorSmartphone}
          title="No kiosk accounts yet"
          description="Add an account for each physical office kiosk device."
        />
      )}

      {(isLoading || accounts.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={accounts}
          rowKey={(a) => a.id}
          columns={[
            { key: 'email', header: 'Email', render: (a) => <span className="font-medium text-ink">{a.email}</span> },
            {
              key: 'password',
              header: 'Password',
              render: (a) => (
                <PasswordCell key={`${a.id}-${passwordVersion[a.id] ?? 0}`} account={a} canReveal={canCreate} />
              ),
            },
            { key: 'status', header: 'Status', render: (a) => <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{a.status}</Badge> },
            {
              key: 'lastLoginAt',
              header: 'Last Sign-In',
              render: (a) => (a.lastLoginAt ? formatDisplayDate(a.lastLoginAt) : 'Never'),
            },
            {
              key: 'actions',
              header: '',
              className: 'w-16 text-right',
              render: (a) =>
                canCreate ? (
                  <button
                    type="button"
                    onClick={() => setResetTarget(a)}
                    aria-label={`Reset password for ${a.email}`}
                    title="Reset Password"
                    className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
                  >
                    <KeyRound className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      )}

      {isModalOpen && (
        <CreateScannerAccountModal
          brandId={ownBrandId}
          onClose={() => setIsModalOpen(false)}
          onCreated={() => {
            setIsModalOpen(false);
            load();
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          account={resetTarget}
          onClose={() => setResetTarget(null)}
          onReset={() =>
            setPasswordVersion((prev) => ({ ...prev, [resetTarget.id]: (prev[resetTarget.id] ?? 0) + 1 }))
          }
        />
      )}
    </div>
  );
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

function CreateScannerAccountModal({
  brandId,
  onClose,
  onCreated,
}: {
  brandId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await createScannerAccount({ email, password, brandId });
      onCreated();
    } catch (err) {
      setError(extractError(err, 'Could not create this kiosk account.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Add Kiosk Account" onClose={onClose}>
      <div className="space-y-4">
        <Input
          id="kiosk-email"
          type="email"
          label="Kiosk Email"
          placeholder="reception-kiosk@yourcompany.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <div>
          <label htmlFor="kiosk-account-password" className="mb-1.5 block text-sm font-medium text-ink">
            Password
          </label>
          <PasswordInput
            id="kiosk-account-password"
            icon={Lock}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!email || password.length < 8}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// A kiosk account's real password can never be shown again once created —
// only its one-way hash is stored, same as every other login in this
// system — so "I need to know this kiosk's password" is solved by setting
// a new one here, not by revealing the old one. Masked by default, same
// eye-icon show/hide PasswordInput as every other password field in the app.
function ResetPasswordModal({
  account,
  onClose,
  onReset,
}: {
  account: ScannerAccount;
  onClose: () => void;
  // Fired only on a successful reset (not on Cancel) — lets the parent
  // invalidate that row's cached revealed-password state so it can't go on
  // showing the now-stale plaintext.
  onReset: () => void;
}) {
  const showToast = useToast();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await resetScannerAccountPassword(account.id, password);
      showToast(`Password reset for ${account.email}.`, 'success');
      onReset();
      onClose();
    } catch (err) {
      setError(extractError(err, 'Could not reset this kiosk account’s password.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={`Reset Password — ${account.email}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="kiosk-reset-password" className="mb-1.5 block text-sm font-medium text-ink">
            New Password
          </label>
          <PasswordInput
            id="kiosk-reset-password"
            icon={Lock}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={password.length < 8}>
            Reset Password
          </Button>
        </div>
      </div>
    </Modal>
  );
}

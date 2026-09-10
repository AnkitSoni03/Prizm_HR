import { useEffect, useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff, KeyRound, Loader2, Lock, MapPin, MonitorSmartphone, Plus, Trash2, X } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyStateCard } from '../../../components/EmptyStateCard';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PasswordInput } from '../../../components/ui/PasswordInput';
import { Table } from '../../../components/ui/Table';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import {
  createKioskAccount,
  deleteKioskAccount,
  getKioskAccountPassword,
  listKioskAccounts,
  resetKioskAccountPassword,
  updateKioskAccountLocations,
  type KioskAccount,
} from '../../../api/superAdmin/kioskAccounts';
import { formatDisplayDate } from '../../../utils/dateDisplay';

const MASKED_PASSWORD = '••••••••';

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

// One cell's worth of reveal-on-demand state, kept local to the row instead
// of one big map on the parent — each kiosk's password is only ever fetched
// (and decrypted server-side) the moment someone actually clicks its eye
// icon, never preloaded for the whole list. Once fetched it's cached for the
// rest of this page view; a reload starts masked again.
function PasswordCell({ account }: { account: KioskAccount }) {
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
      setPassword(await getKioskAccountPassword(account.id, account.groupId));
      setRevealed(true);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }

  const displayText = revealed ? password ?? 'Not available — reset password to enable' : MASKED_PASSWORD;

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

// Kiosk accounts belong to a Group, not a Company — one login serves every
// employee of every Company and Brand under it, and each physical device
// claims one of the account's locations at sign-in so two devices can never
// run as the same place. Only Super Admin can create them (the backend gates
// these routes with requireSuperAdmin), which is why this lives on the Group
// detail page rather than in any admin portal's Settings.
export function KioskAccountsSection({ groupId }: { groupId: string }) {
  const confirm = useConfirm();
  const showToast = useToast();

  const [accounts, setAccounts] = useState<KioskAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<KioskAccount | null>(null);
  const [locationsTarget, setLocationsTarget] = useState<KioskAccount | null>(null);
  // Bumped for one account id whenever its password is reset — part of that
  // row's PasswordCell `key`, forcing a fresh mount (and so a fresh
  // unfetched state) instead of going on showing a now-stale plaintext.
  const [passwordVersion, setPasswordVersion] = useState<Record<string, number>>({});

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      setAccounts(await listKioskAccounts(groupId));
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
  }, [groupId]);

  async function handleDelete(account: KioskAccount) {
    const confirmed = await confirm({
      title: 'Delete kiosk account',
      message: `Delete "${account.email}"? Any device signed in with it stops working immediately. Past attendance records are kept.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteKioskAccount(account.id, groupId);
      showToast(`Kiosk account ${account.email} deleted.`, 'success');
      load();
    } catch (err) {
      showToast(extractError(err, 'Could not delete this kiosk account.'));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Attendance Kiosks</h3>
          <p className="text-xs text-ink-muted">
            One shared login per kiosk account, covering every company and brand in this group. Each device picks
            one location at sign-in.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Add Kiosk Account
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && accounts.length === 0 && (
        <EmptyStateCard
          icon={MonitorSmartphone}
          title="No kiosk accounts yet"
          description="Create one and share its email and password with this group — their devices sign in with it to mark face attendance."
        />
      )}

      {(isLoading || accounts.length > 0) && (
        <Table
          isLoading={isLoading}
          rows={accounts}
          rowKey={(a) => a.id}
          columns={[
            {
              key: 'email',
              header: 'Email',
              render: (a) => <span className="font-medium text-ink">{a.email}</span>,
            },
            {
              key: 'password',
              header: 'Password',
              render: (a) => <PasswordCell key={`${a.id}-${passwordVersion[a.id] ?? 0}`} account={a} />,
            },
            {
              key: 'locations',
              header: 'Locations',
              render: (a) => (
                <div className="flex flex-wrap gap-1.5">
                  {a.locations.length === 0 && <span className="text-ink-muted">—</span>}
                  {a.locations.map((location) => (
                    <Badge
                      key={location.id}
                      tone={location.inUse ? 'success' : 'neutral'}
                      title={location.inUse ? 'A device is signed in here right now' : 'Free'}
                    >
                      {location.name}
                    </Badge>
                  ))}
                </div>
              ),
            },
            {
              key: 'lastLoginAt',
              header: 'Last Sign-In',
              render: (a) => (a.lastLoginAt ? formatDisplayDate(a.lastLoginAt) : 'Never'),
            },
            {
              key: 'actions',
              header: '',
              className: 'w-28 text-right',
              render: (a) => (
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setLocationsTarget(a)}
                    aria-label={`Edit locations for ${a.email}`}
                    title="Edit Locations"
                    className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
                  >
                    <MapPin className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetTarget(a)}
                    aria-label={`Reset password for ${a.email}`}
                    title="Reset Password"
                    className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
                  >
                    <KeyRound className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(a)}
                    aria-label={`Delete ${a.email}`}
                    title="Delete Kiosk Account"
                    className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {isCreateOpen && (
        <CreateKioskAccountModal
          groupId={groupId}
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
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

      {locationsTarget && (
        <EditLocationsModal
          account={locationsTarget}
          onClose={() => setLocationsTarget(null)}
          onSaved={() => {
            setLocationsTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// A growable list of plain text rows rather than a comma-separated field —
// locations are free text ("Head Office — Gate 2"), so a separator would be
// ambiguous, and each row can be removed independently.
function LocationListEditor({
  locations,
  onChange,
}: {
  locations: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">Locations</span>
      <div className="space-y-2">
        {locations.map((location, index) => (
          // Index is the only stable identity a raw string row has; the
          // input's value comes from the array either way, so a shift on
          // removal still renders correctly.
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              aria-label={`Location ${index + 1}`}
              placeholder={`Location ${index + 1}`}
              value={location}
              onChange={(event) => {
                const next = [...locations];
                next[index] = event.target.value;
                onChange(next);
              }}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => onChange(locations.filter((_, i) => i !== index))}
              disabled={locations.length === 1}
              aria-label={`Remove location ${index + 1}`}
              title="Remove"
              className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...locations, ''])}
        className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:opacity-80"
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} />
        Add another location
      </button>
    </div>
  );
}

function CreateKioskAccountModal({
  groupId,
  onClose,
  onCreated,
}: {
  groupId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [locations, setLocations] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledLocations = locations.map((location) => location.trim()).filter(Boolean);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await createKioskAccount({ groupId, email, password, locations: filledLocations });
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
        <p className="text-sm text-ink-muted">
          Share this email and password with the group. Every device they set up signs in with it and then picks
          one of the locations below — a location already in use on another device won’t be offered.
        </p>
        <Input
          id="kiosk-email"
          type="email"
          label="Kiosk Email"
          placeholder="kiosk@srisaigroup.com"
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
        <LocationListEditor locations={locations} onChange={setLocations} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={!email || password.length < 8 || filledLocations.length === 0}
          >
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditLocationsModal({
  account,
  onClose,
  onSaved,
}: {
  account: KioskAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const showToast = useToast();
  const [locations, setLocations] = useState<string[]>(
    account.locations.length > 0 ? account.locations.map((location) => location.name) : ['']
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledLocations = locations.map((location) => location.trim()).filter(Boolean);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await updateKioskAccountLocations(account.id, { groupId: account.groupId, locations: filledLocations });
      showToast(`Locations updated for ${account.email}.`, 'success');
      onSaved();
    } catch (err) {
      setError(extractError(err, 'Could not update these locations.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={`Locations — ${account.email}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Removing a location signs out whichever device is currently running as it. Attendance already recorded
          there is kept.
        </p>
        <LocationListEditor locations={locations} onChange={setLocations} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={filledLocations.length === 0}>
            Save Locations
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  account,
  onClose,
  onReset,
}: {
  account: KioskAccount;
  onClose: () => void;
  // Fired only on a successful reset (not on Cancel) — lets the parent
  // invalidate that row's cached revealed password.
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
      await resetKioskAccountPassword(account.id, { groupId: account.groupId, password });
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

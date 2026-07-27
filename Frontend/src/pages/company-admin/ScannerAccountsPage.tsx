import { useEffect, useState } from 'react';
import axios from 'axios';
import { Lock, MonitorSmartphone, Plus } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import {
  createScannerAccount,
  listScannerAccounts,
  type ScannerAccount,
} from '../../api/companyAdmin/scannerAccounts';
import { formatDisplayDate } from '../../utils/dateDisplay';

// Reused as-is by both /company-admin/scanner-accounts and
// /brand-admin/scanner-accounts (same pattern as OrganizationPage/
// HolidaysPage) — the backend's scanner_account:create grant is already
// brand-scoped for Brand Admin, so no portal-specific branching is needed
// here at all.
export function ScannerAccountsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('scanner_account:create');

  const [accounts, setAccounts] = useState<ScannerAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listScannerAccounts();
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
  }, []);

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
            { key: 'status', header: 'Status', render: (a) => <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{a.status}</Badge> },
            {
              key: 'lastLoginAt',
              header: 'Last Sign-In',
              render: (a) => (a.lastLoginAt ? formatDisplayDate(a.lastLoginAt) : 'Never'),
            },
          ]}
        />
      )}

      {isModalOpen && (
        <CreateScannerAccountModal
          onClose={() => setIsModalOpen(false)}
          onCreated={() => {
            setIsModalOpen(false);
            load();
          }}
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

function CreateScannerAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await createScannerAccount({ email, password });
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

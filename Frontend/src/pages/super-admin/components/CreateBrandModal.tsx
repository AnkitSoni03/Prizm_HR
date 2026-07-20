import { useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Copy } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { createBrand, inviteBrandAdmin, type Brand } from '../../../api/tenancy';

interface CreateBrandModalProps {
  companyId: string;
  onClose: () => void;
  onCreated: () => void;
}

type Step = 'form' | 'invite' | 'done';

// Mirrors CreateGroupModal.tsx/CreateCompanyModal.tsx's form/invite/done
// shape: a Brand Admin is a real login-capable user (see auth.service.js's
// inviteBrandAdmin), same as a Group/Company's first admin, so the invite
// step is not optional-by-design the way the old single-step version implied.
export function CreateBrandModal({ companyId, onClose, onCreated }: CreateBrandModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdBrand, setCreatedBrand] = useState<Brand | null>(null);
  const [email, setEmail] = useState('');
  const [activationToken, setActivationToken] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const activationUrl = activationToken
    ? `${window.location.origin}/activate?token=${encodeURIComponent(activationToken)}`
    : null;

  async function handleCopyActivationUrl() {
    if (!activationUrl) return;
    await navigator.clipboard.writeText(activationUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  async function handleCreateSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const brand = await createBrand({ companyId, name, code, address, city, state });
      setCreatedBrand(brand);
      onCreated();
      setStep('invite');
    } catch {
      setError('Could not create the brand. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleInviteSubmit(event: FormEvent) {
    event.preventDefault();
    if (!createdBrand) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await inviteBrandAdmin({ brandId: createdBrand.id, email });
      setActivationToken(result.activationToken ?? null);
      setStep('done');
    } catch {
      setError('Could not send the invite. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === 'invite' && createdBrand) {
    return (
      <Modal title="Invite the first Brand Admin" onClose={onClose}>
        <p className="mb-4 text-sm text-ink-muted">
          "{createdBrand.name}" was created. Optionally invite its first Brand Admin now.
        </p>
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          {error && <p className="text-sm text-danger">{error}</p>}
          <Input
            id="brand-admin-email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@company.com"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Skip for now
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Send Invite
            </Button>
          </div>
        </form>
      </Modal>
    );
  }

  if (step === 'done') {
    return (
      <Modal title="Invite sent" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={1.5} />
          <p className="text-sm text-ink-muted">
            An invitation was created for <span className="font-medium">{email}</span>.
          </p>
          {activationUrl && (
            <div className="w-full rounded-xl border border-border bg-page p-3 text-left">
              <p className="mb-1 text-xs font-medium text-ink-muted">
                Activation link (dev only — no email provider configured yet):
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={activationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block flex-1 break-all text-xs text-primary hover:underline"
                >
                  {activationUrl}
                </a>
                <button
                  type="button"
                  onClick={handleCopyActivationUrl}
                  aria-label="Copy activation link"
                  className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-card hover:text-ink"
                >
                  {isCopied ? (
                    <Check className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
                  ) : (
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>
          )}
          <Button className="mt-2" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create Brand" onClose={onClose}>
      <form onSubmit={handleCreateSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="brand-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Downtown Outlet"
        />
        <Input
          id="brand-code"
          label="Code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="DTO"
        />
        <Input
          id="brand-address"
          label="Address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="123 Main Street"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="brand-city"
            label="City"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Chennai"
          />
          <Input
            id="brand-state"
            label="State"
            value={state}
            onChange={(event) => setState(event.target.value)}
            placeholder="Tamil Nadu"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create Brand
          </Button>
        </div>
      </form>
    </Modal>
  );
}

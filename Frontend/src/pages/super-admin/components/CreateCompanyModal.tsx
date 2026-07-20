import { useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Copy } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { createCompany, inviteCompanyAdmin, type Company, type Plan } from '../../../api/tenancy';

interface CreateCompanyModalProps {
  groupId: string;
  plans: Plan[];
  onClose: () => void;
  onCreated: () => void;
}

type Step = 'form' | 'invite' | 'done';

export function CreateCompanyModal({ groupId, plans, onClose, onCreated }: CreateCompanyModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [planId, setPlanId] = useState('');
  const [usesBrands, setUsesBrands] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdCompany, setCreatedCompany] = useState<Company | null>(null);
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
      const company = await createCompany({
        groupId,
        name,
        legalName,
        gstNumber,
        planId: planId || null,
        usesBrands,
      });
      setCreatedCompany(company);
      onCreated();
      setStep('invite');
    } catch {
      setError('Could not create the company. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleInviteSubmit(event: FormEvent) {
    event.preventDefault();
    if (!createdCompany) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await inviteCompanyAdmin({ companyId: createdCompany.id, email });
      setActivationToken(result.activationToken ?? null);
      setStep('done');
    } catch {
      setError('Could not send the invite. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === 'invite' && createdCompany) {
    return (
      <Modal title="Invite the first Company Admin" onClose={onClose}>
        <p className="mb-4 text-sm text-ink-muted">
          "{createdCompany.name}" was created. Optionally invite its first Company Admin now.
        </p>
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          {error && <p className="text-sm text-danger">{error}</p>}
          <Input
            id="company-admin-email"
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
    <Modal title="Create Company" onClose={onClose}>
      <form onSubmit={handleCreateSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="company-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Tech Prizm Pvt Ltd"
        />
        <Input
          id="company-legal-name"
          label="Legal Name"
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
          placeholder="Tech Prizm Private Limited"
        />
        <Input
          id="company-gst"
          label="GST Number"
          value={gstNumber}
          onChange={(event) => setGstNumber(event.target.value)}
          placeholder="29ABCDE1234F1Z5"
        />
        <Select
          id="company-plan"
          label="Plan"
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
          placeholder="No plan"
          options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
        />
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Organization structure</p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="uses-brands"
                className="mt-0.5"
                checked={usesBrands}
                onChange={() => setUsesBrands(true)}
              />
              <span>
                <span className="block text-sm font-medium text-ink">This company operates with Brands</span>
                <span className="block text-xs text-ink-muted">
                  Rosters and Employees are created under each Brand.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="uses-brands"
                className="mt-0.5"
                checked={!usesBrands}
                onChange={() => setUsesBrands(false)}
              />
              <span>
                <span className="block text-sm font-medium text-ink">This company operates directly (no Brands)</span>
                <span className="block text-xs text-ink-muted">
                  Rosters and Employees are created straight at the Company level.
                </span>
              </span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create Company
          </Button>
        </div>
      </form>
    </Modal>
  );
}

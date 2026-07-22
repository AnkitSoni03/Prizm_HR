import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { AdminInvitationPanel } from './AdminInvitationPanel';
import { useAuth } from '../../../context/auth-context';
import { useConfirm } from '../../../context/confirm-context';
import {
  getCompanyAdminInvitation,
  inviteCompanyAdmin,
  updateCompany,
  type AdminInvitation,
  type Company,
  type Plan,
} from '../../../api/tenancy';

interface EditCompanyModalProps {
  company: Company;
  plans: Plan[];
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS: { value: Company['status']; label: string }[] = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'grace', label: 'Grace' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'terminated', label: 'Terminated' },
];

function statusTone(status: Company['status']) {
  if (status === 'active') return 'success';
  if (status === 'trial' || status === 'grace') return 'warning';
  return 'danger';
}

export function EditCompanyModal({ company, plans, onClose, onSaved }: EditCompanyModalProps) {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  // Group Admin/Company Admin both hold company:update (see
  // company.controller.js::update) so they can reach this modal too, but
  // neither holds user:invite or company:suspend — those stay Super-Admin-
  // only, so the invitation panel and status control are hidden rather than
  // shown-but-guaranteed-to-fail.
  const canManageInvitation = hasPermission('user:invite');
  const canChangeStatus = hasPermission('company:suspend');

  const [name, setName] = useState(company.name);
  const [legalName, setLegalName] = useState(company.legalName ?? '');
  const [gstNumber, setGstNumber] = useState(company.gstNumber ?? '');
  const [status, setStatus] = useState(company.status);
  const [planId, setPlanId] = useState(company.planId ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<AdminInvitation | null | undefined>(undefined);

  useEffect(() => {
    if (!canManageInvitation) return;
    let cancelled = false;
    getCompanyAdminInvitation(company.id)
      .then((result) => {
        if (!cancelled) setInvitation(result);
      })
      .catch(() => {
        if (!cancelled) setInvitation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [company.id, canManageInvitation]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (canChangeStatus && status !== company.status && status !== 'active') {
      const confirmed = await confirm({
        title: 'Confirm status change',
        message: `Set "${company.name}" to ${status}? This affects everyone in this company.`,
        confirmLabel: 'Set Status',
        variant: 'danger',
      });
      if (!confirmed) return;
    }
    setIsSubmitting(true);
    try {
      await updateCompany(company.id, {
        name,
        legalName: legalName || null,
        gstNumber: gstNumber || null,
        planId: planId || null,
        // Omitted entirely (not just left unchanged) for a scoped caller —
        // the backend 403s on a company:update PATCH that even includes
        // `status` unless the caller holds company:suspend.
        ...(canChangeStatus && { status }),
      });
      onSaved();
      onClose();
    } catch {
      setError('Could not save changes. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Edit Company" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="edit-company-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          id="edit-company-legal-name"
          label="Legal Name"
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
        />
        <Input
          id="edit-company-gst"
          label="GST Number"
          value={gstNumber}
          onChange={(event) => setGstNumber(event.target.value)}
        />
        {canChangeStatus ? (
          <Select
            id="edit-company-status"
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as Company['status'])}
            options={STATUS_OPTIONS}
          />
        ) : (
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Status</p>
            <Badge tone={statusTone(company.status)}>{company.status}</Badge>
          </div>
        )}
        <Select
          id="edit-company-plan"
          label="Plan"
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
          placeholder="No plan"
          options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
        />

        {canManageInvitation && (
          <AdminInvitationPanel
            roleLabel="Company Admin"
            invitation={invitation}
            onInvite={(email) => inviteCompanyAdmin({ companyId: company.id, email })}
            onInvited={setInvitation}
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

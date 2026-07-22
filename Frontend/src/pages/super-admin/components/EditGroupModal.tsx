import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { AdminInvitationPanel } from './AdminInvitationPanel';
import { useConfirm } from '../../../context/confirm-context';
import {
  getGroupAdminInvitation,
  inviteGroupAdmin,
  updateGroup,
  type AdminInvitation,
  type Group,
  type Plan,
} from '../../../api/tenancy';

interface EditGroupModalProps {
  group: Group;
  plans: Plan[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditGroupModal({ group, plans, onClose, onSaved }: EditGroupModalProps) {
  const confirm = useConfirm();
  const [name, setName] = useState(group.name);
  const [status, setStatus] = useState(group.status);
  const [planId, setPlanId] = useState(group.planId ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<AdminInvitation | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getGroupAdminInvitation(group.id)
      .then((result) => {
        if (!cancelled) setInvitation(result);
      })
      .catch(() => {
        if (!cancelled) setInvitation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (status !== group.status && status !== 'active') {
      const confirmed = await confirm({
        title: 'Confirm status change',
        message: `Set "${group.name}" to ${status}? This affects every company under it.`,
        confirmLabel: 'Set Status',
        variant: 'danger',
      });
      if (!confirmed) return;
    }
    setIsSubmitting(true);
    try {
      await updateGroup(group.id, { name, status, planId: planId || null });
      onSaved();
      onClose();
    } catch {
      setError('Could not save changes. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Edit Group" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="edit-group-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Select
          id="edit-group-status"
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as Group['status'])}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
        <Select
          id="edit-group-plan"
          label="Plan"
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
          placeholder="No plan"
          options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
        />

        <AdminInvitationPanel
          roleLabel="Group Admin"
          invitation={invitation}
          onInvite={(email) => inviteGroupAdmin({ groupId: group.id, email })}
          onInvited={setInvitation}
        />

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

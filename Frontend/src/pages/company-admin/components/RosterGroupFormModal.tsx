import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { createRosterGroup, updateRosterGroup, type RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';

interface RosterGroupFormModalProps {
  rosterGroup?: RosterPolicyGroup;
  onClose: () => void;
  onSaved: () => void;
}

// Just name + description — Shift/Holiday/Company Policy/Leave Policy are
// all assigned to a Roster from those entities' OWN create/edit forms
// ("Assign to Roster(s)"), not from here.
export function RosterGroupFormModal({ rosterGroup, onClose, onSaved }: RosterGroupFormModalProps) {
  const isEdit = !!rosterGroup;
  const [name, setName] = useState(rosterGroup?.name ?? '');
  const [description, setDescription] = useState(rosterGroup?.description ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isEdit) {
        await updateRosterGroup(rosterGroup.id, { name, description: description || null });
      } else {
        await createRosterGroup({ name, description: description || undefined });
      }
      onSaved();
      onClose();
    } catch {
      setError(`Could not ${isEdit ? 'update' : 'create'} this Roster. Please try again.`);
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Roster' : 'Create Roster'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="roster-group-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Kolkata"
        />
        <Input
          id="roster-group-description"
          label="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Kolkata-based employees — regional holidays and leave quota"
        />
        <p className="-mt-2 text-xs text-ink-muted">
          Once created, assign a Shift, Holidays, Company Policies, and Leave Policies to this
          Roster from each of those pages' own create/edit forms.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? 'Save Changes' : 'Create Roster'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

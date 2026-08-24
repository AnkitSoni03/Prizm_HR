import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
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
  // Validity period is optional — blank validityValue means "no expiry",
  // same as both columns being null on the backend. Kept as a string in
  // state (not number) so the field can be genuinely empty rather than
  // coercing to 0.
  const [validityValue, setValidityValue] = useState(rosterGroup?.validityValue?.toString() ?? '');
  const [validityUnit, setValidityUnit] = useState<'days' | 'months'>(rosterGroup?.validityUnit ?? 'months');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsedValidity = validityValue.trim() === '' ? null : Number(validityValue);
    if (parsedValidity !== null && (!Number.isInteger(parsedValidity) || parsedValidity <= 0)) {
      setError('Roster Period must be a positive whole number.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        name,
        description: description || null,
        validityValue: parsedValidity,
        validityUnit: parsedValidity === null ? null : validityUnit,
      };
      if (isEdit) {
        await updateRosterGroup(rosterGroup.id, payload);
      } else {
        await createRosterGroup(payload);
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
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Roster Period (optional)</p>
          <div className="flex gap-2">
            <Input
              id="roster-group-validity-value"
              label="Value"
              type="number"
              min={1}
              step={1}
              value={validityValue}
              onChange={(event) => setValidityValue(event.target.value)}
              placeholder="e.g. 6"
              className="w-28"
            />
            <Select
              id="roster-group-validity-unit"
              label="Unit"
              value={validityUnit}
              onChange={(event) => setValidityUnit(event.target.value as 'days' | 'months')}
              options={[
                { value: 'months', label: 'Months' },
                { value: 'days', label: 'Days' },
              ]}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            When set, an employee assigned this Roster is valid for this long from THEIR OWN assignment
            date — not a fixed calendar date. Leave blank for no expiry.
          </p>
        </div>
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

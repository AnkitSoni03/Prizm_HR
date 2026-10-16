import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { createRosterGroup, updateRosterGroup, type RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';
import { useIsBrandAdminPortal } from '../../../hooks/useIsBrandAdminPortal';
import type { Brand } from '../../../api/tenancy';

interface RosterGroupFormModalProps {
  rosterGroup?: RosterPolicyGroup;
  // Only passed (and only then does the Brand field render) when the
  // company actually has Brands — a direct-mode company has nothing to pick
  // from, same convention as ShiftFormModal.tsx's own Brand field.
  brands?: Brand[];
  onClose: () => void;
  onSaved: () => void;
}

// Just name + description — Shift/Holiday/Company Policy/Leave Policy are
// all assigned to a Roster from those entities' OWN create/edit forms
// ("Assign to Roster(s)"), not from here.
export function RosterGroupFormModal({ rosterGroup, brands = [], onClose, onSaved }: RosterGroupFormModalProps) {
  const isEdit = !!rosterGroup;
  // Company Admin managing a Brand-mode company must always pin every
  // Roster to one real Brand — there's no "Shared (all brands)" choice any
  // more. Brand Admin (identified by URL, not brand count — see the hook's
  // own comment) and a direct-mode company (zero Brands) never see this
  // field at all, same as before.
  const isBrandAdminPortal = useIsBrandAdminPortal();
  const showBrandField = !isBrandAdminPortal && brands.length > 0;
  const defaultBrandId = showBrandField ? (brands[0]?.id ?? '') : '';
  const [name, setName] = useState(rosterGroup?.name ?? '');
  const [description, setDescription] = useState(rosterGroup?.description ?? '');
  const [brandId, setBrandId] = useState(rosterGroup?.brandId || defaultBrandId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      // Only ever sent when the field below is actually rendered/editable
      // (showBrandField) — a brand-scoped caller (Brand Admin) is blocked
      // server-side from submitting a brandId at all, even an unchanged
      // one (see brandScope.js::assertBrandReassignAllowed).
      const payload = {
        name,
        description: description || null,
        ...(showBrandField ? { brandId } : {}),
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
        {showBrandField && (
          <Select
            id="roster-group-brand"
            label="Brand"
            required
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        <p className="-mt-2 text-xs text-ink-muted">
          Once created, assign a Shift, Holidays, Company Policies, and Leave Policies to this
          Roster from each of those pages' own create/edit forms. A Roster never expires — leaves
          renew each year on the company's (or employee's) Yearly Roster Update month.
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

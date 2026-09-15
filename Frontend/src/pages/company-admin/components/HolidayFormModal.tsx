import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { RosterMultiSelect } from '../../../components/ui/RosterMultiSelect';
import { createHoliday, updateHoliday, type Holiday } from '../../../api/companyAdmin/holidays';
import { listRosterGroups, type RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';
import { useIsBrandAdminPortal } from '../../../hooks/useIsBrandAdminPortal';
import type { Brand } from '../../../api/tenancy';

interface HolidayFormModalProps {
  holiday?: Holiday;
  // Only passed (and only then does the Brand field render) when the
  // company actually has Brands — a direct-mode company has nothing to pick
  // from, same convention as ShiftFormModal.tsx's own Brand field.
  brands?: Brand[];
  // Pre-selects these Rosters — used when this modal is opened from inside a
  // Roster's own detail view ("Add Holiday" right there). Ignored when
  // editing an existing holiday (its own rosterGroups win).
  defaultRosterGroupIds?: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function HolidayFormModal({ holiday, brands = [], defaultRosterGroupIds, onClose, onSaved }: HolidayFormModalProps) {
  const isEdit = !!holiday;
  // Company Admin managing a Brand-mode company must always pin every
  // Holiday to one real Brand — there's no "Shared (all brands)" choice any
  // more. Brand Admin (identified by URL, not brand count — see the hook's
  // own comment) and a direct-mode company (zero Brands) never see this
  // field at all, same as before.
  const isBrandAdminPortal = useIsBrandAdminPortal();
  const showBrandField = !isBrandAdminPortal && brands.length > 0;
  const defaultBrandId = showBrandField ? (brands[0]?.id ?? '') : '';
  const [date, setDate] = useState(holiday?.date ?? '');
  const [toDate, setToDate] = useState(holiday?.endDate ?? holiday?.date ?? '');
  const [name, setName] = useState(holiday?.name ?? '');
  const [brandId, setBrandId] = useState(holiday?.brandId || defaultBrandId);
  const [rosterGroups, setRosterGroups] = useState<RosterPolicyGroup[]>([]);
  const [rosterGroupIds, setRosterGroupIds] = useState<string[]>(
    holiday?.rosterGroups?.map((rg) => rg.id) ?? defaultRosterGroupIds ?? []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRosterGroups()
      .then(setRosterGroups)
      .catch(() => setRosterGroups([]));
  }, []);

  // Shared (brandId '') shows every Roster in the company, across every
  // Brand — the backend allows a Shared holiday to link to any of them (see
  // rosterGroupAssignment.js::assertRosterGroupsBelongToCompany). A
  // Brand-specific selection narrows the list down to ONLY that Brand's own
  // Rosters — not a sibling Brand's, and not the company's Shared Rosters
  // either, since picking a specific Brand here means "this holiday belongs
  // to Snow Village," and only Snow Village's own Rosters are relevant to
  // choose from.
  const availableRosterGroups = brandId ? rosterGroups.filter((rg) => rg.brandId === brandId) : rosterGroups;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      // Only ever sent when the field above is actually rendered/editable
      // (showBrandField) — a brand-scoped caller (Brand Admin) is blocked
      // server-side from submitting a brandId at all, even an unchanged
      // one (see brandScope.js::assertBrandReassignAllowed), so it must
      // never be included in their payload.
      const brandPatch = showBrandField ? { brandId } : {};
      if (isEdit) {
        await updateHoliday(holiday.id, { date, toDate: toDate || date, name, rosterGroupIds, ...brandPatch });
      } else {
        await createHoliday({ date, toDate: toDate || undefined, name, rosterGroupIds, ...brandPatch });
      }
      onSaved();
      onClose();
    } catch {
      setError(`Could not ${isEdit ? 'update' : 'create'} this holiday. Please try again.`);
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Holiday' : 'Add Holiday'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="holiday-date"
            label="From Date"
            type="date"
            required
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              // Keep the range valid if "From" is moved past the current "To".
              if (toDate && toDate < event.target.value) setToDate(event.target.value);
            }}
          />
          <Input
            id="holiday-to-date"
            label="To Date"
            type="date"
            required
            min={date || undefined}
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
        <p className="-mt-2 text-xs text-ink-muted">
          Same date for both for a single-day holiday, or set a later "To Date" for a multi-day
          holiday (e.g. a 3-day festival).
        </p>
        <Input
          id="holiday-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Independence Day"
        />
        {showBrandField && (
          <Select
            id="holiday-brand"
            label="Brand"
            required
            value={brandId}
            onChange={(event) => {
              const nextBrandId = event.target.value;
              const stillValid = new Set(
                (nextBrandId ? rosterGroups.filter((rg) => rg.brandId === nextBrandId) : rosterGroups).map((rg) => rg.id)
              );
              setBrandId(nextBrandId);
              setRosterGroupIds((prev) => prev.filter((id) => stillValid.has(id)));
            }}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        <RosterMultiSelect rosterGroups={availableRosterGroups} selectedIds={rosterGroupIds} onChange={setRosterGroupIds} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? 'Save Changes' : 'Add Holiday'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

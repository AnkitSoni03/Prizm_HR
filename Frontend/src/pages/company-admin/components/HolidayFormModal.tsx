import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { RosterMultiSelect } from '../../../components/ui/RosterMultiSelect';
import { createHoliday, updateHoliday, type Holiday } from '../../../api/companyAdmin/holidays';
import { listRosterGroups, type RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';

interface HolidayFormModalProps {
  holiday?: Holiday;
  onClose: () => void;
  onSaved: () => void;
}

export function HolidayFormModal({ holiday, onClose, onSaved }: HolidayFormModalProps) {
  const isEdit = !!holiday;
  const [date, setDate] = useState(holiday?.date ?? '');
  const [toDate, setToDate] = useState(holiday?.endDate ?? holiday?.date ?? '');
  const [name, setName] = useState(holiday?.name ?? '');
  const [rosterGroups, setRosterGroups] = useState<RosterPolicyGroup[]>([]);
  const [rosterGroupIds, setRosterGroupIds] = useState<string[]>(
    holiday?.rosterGroups?.map((rg) => rg.id) ?? []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRosterGroups()
      .then(setRosterGroups)
      .catch(() => setRosterGroups([]));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isEdit) {
        await updateHoliday(holiday.id, { date, toDate: toDate || date, name, rosterGroupIds });
      } else {
        await createHoliday({ date, toDate: toDate || undefined, name, rosterGroupIds });
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
        <RosterMultiSelect rosterGroups={rosterGroups} selectedIds={rosterGroupIds} onChange={setRosterGroupIds} />
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

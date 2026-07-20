import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { createHoliday, updateHoliday, type Holiday } from '../../../api/companyAdmin/holidays';

interface HolidayFormModalProps {
  holiday?: Holiday;
  onClose: () => void;
  onSaved: () => void;
}

export function HolidayFormModal({ holiday, onClose, onSaved }: HolidayFormModalProps) {
  const isEdit = !!holiday;
  const [date, setDate] = useState(holiday?.date ?? '');
  const [name, setName] = useState(holiday?.name ?? '');
  const [type, setType] = useState<'public' | 'optional'>(holiday?.type ?? 'public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isEdit) {
        await updateHoliday(holiday.id, { date, name, type });
      } else {
        await createHoliday({ date, name, type });
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
        <Input
          id="holiday-date"
          label="Date"
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <Input
          id="holiday-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Independence Day"
        />
        <Select
          id="holiday-type"
          label="Type"
          value={type}
          onChange={(event) => setType(event.target.value as 'public' | 'optional')}
          options={[
            { value: 'public', label: 'Public' },
            { value: 'optional', label: 'Optional' },
          ]}
        />
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

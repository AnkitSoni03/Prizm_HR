import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { createShiftRoster } from '../../../api/companyAdmin/attendance';
import { useAuth } from '../../../context/auth-context';
import type { Brand, Shift } from '../../../api/tenancy';

interface RosterFormModalProps {
  brands: Brand[];
  shifts: Shift[];
  onClose: () => void;
  onCreated: () => void;
}

export function RosterFormModal({ brands, shifts, onClose, onCreated }: RosterFormModalProps) {
  const { user } = useAuth();
  // companyUsesBrands is only null for Super Admin, which never renders
  // this Company Admin component — default true is just a defensive
  // fallback, not an expected runtime path.
  const usesBrands = user?.companyUsesBrands ?? true;
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? '');
  const [rosterDate, setRosterDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createShiftRoster({ brandId: usesBrands ? brandId : undefined, shiftId, rosterDate });
      onCreated();
      onClose();
    } catch {
      setError('Could not create the roster entry. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Create Roster" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-sm text-ink-muted">
          Creates an unassigned roster slot for this date and shift — an employee can be assigned to it
          later. New rosters start as <span className="font-medium text-ink">draft</span>.
        </p>
        {usesBrands && (
          <Select
            id="roster-brand"
            label="Brand"
            required
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            disabled={brands.length === 0}
            placeholder={brands.length === 0 ? 'No brands available' : 'Select a brand'}
            options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
          />
        )}
        <Select
          id="roster-shift"
          label="Shift"
          required
          value={shiftId}
          onChange={(event) => setShiftId(event.target.value)}
          disabled={shifts.length === 0}
          placeholder={shifts.length === 0 ? 'Create a shift first' : 'Select a shift'}
          options={shifts.map((shift) => ({
            value: shift.id,
            label: `${shift.name} (${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)})`,
          }))}
        />
        <Input
          id="roster-date"
          label="Date"
          type="date"
          required
          value={rosterDate}
          onChange={(event) => setRosterDate(event.target.value)}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={shifts.length === 0 || (usesBrands && brands.length === 0)}
          >
            Create Roster
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { updateShiftRoster } from '../../../api/companyAdmin/attendance';
import type { Employee, ShiftRoster } from '../../../api/tenancy';
import { formatDisplayDate } from '../../../utils/dateDisplay';

interface RosterEditModalProps {
  roster: ShiftRoster;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}

export function RosterEditModal({ roster, employees, onClose, onSaved }: RosterEditModalProps) {
  const [employeeId, setEmployeeId] = useState(roster.employeeId ?? '');
  const [status, setStatus] = useState(roster.status);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await updateShiftRoster(roster.id, { employeeId: employeeId || null, status });
      onSaved();
      onClose();
    } catch {
      setError('Could not update this roster entry. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={`Roster — ${formatDisplayDate(roster.rosterDate)}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Select
          id="roster-employee"
          label="Assigned Employee"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          placeholder="Unassigned"
          options={employees.map((employee) => ({
            value: employee.id,
            label: `${employee.name} (${employee.employeeCode})`,
          }))}
        />
        <Select
          id="roster-status"
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as 'draft' | 'published')}
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'published', label: 'Published' },
          ]}
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

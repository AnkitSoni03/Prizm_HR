import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmployeeMultiSelect } from '../../../components/ui/EmployeeMultiSelect';
import { bulkAssignEmployeeShift, type BulkAssignResult } from '../../../api/companyAdmin/attendance';
import type { Employee, Shift } from '../../../api/tenancy';

interface BulkAssignShiftModalProps {
  shifts: Shift[];
  employees: Employee[];
  onClose: () => void;
  // Optional — this modal isn't backed by a visible list on the page it's
  // opened from (default shift assignments aren't shown in a table here),
  // unlike RosterFormModal's onCreated which refreshes a roster table.
  onAssigned?: () => void;
}

// Assigns a standing default shift (employee_shifts) to several employees at
// once — this is the "My Profile" page's Default Shift field; until now
// there was no admin UI at all to set it (only shift_rosters, the per-date
// override, had a create flow).
export function BulkAssignShiftModal({ shifts, employees, onClose, onAssigned }: BulkAssignShiftModalProps) {
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkAssignResult[] | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (employeeIds.length === 0) {
      setError('Select at least one employee.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const outcome = await bulkAssignEmployeeShift({ employeeIds, shiftId, effectiveFrom });
      setResults(outcome);
      onAssigned?.();
    } catch {
      setError('Could not assign the shift. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (results) {
    const created = results.filter((r) => r.status === 'created');
    const skipped = results.filter((r) => r.status === 'skipped');
    return (
      <Modal title="Default Shift Assigned" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <Badge tone="success">{created.length} assigned</Badge>
            {skipped.length > 0 && (
              <span className="ml-2">
                <Badge tone="warning">{skipped.length} skipped</Badge>
              </span>
            )}
          </p>
          {skipped.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
              {skipped.map((row) => {
                const employee = employees.find((e) => e.id === row.employeeId);
                return (
                  <div key={row.employeeId} className="border-b border-border px-3 py-2 text-xs last:border-b-0">
                    <p className="font-medium text-ink">
                      {employee ? `${employee.name} (${employee.employeeCode})` : row.employeeId}
                    </p>
                    <p className="text-ink-muted">{row.reason}</p>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Assign Default Shift" onClose={onClose} widthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-sm text-ink-muted">
          Sets each selected employee&apos;s standing shift going forward from the effective date — this is what
          they follow on any day without a published roster entry overriding it.
        </p>
        <Select
          id="bulk-shift-shift"
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
          id="bulk-shift-effective-from"
          label="Effective From"
          type="date"
          required
          value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
        />
        <EmployeeMultiSelect
          label="Employees"
          employees={employees}
          selectedIds={employeeIds}
          onChange={setEmployeeIds}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={shifts.length === 0 || !effectiveFrom}>
            {employeeIds.length > 0 ? `Assign to ${employeeIds.length} Employee(s)` : 'Assign'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmployeeMultiSelect } from '../../../components/ui/EmployeeMultiSelect';
import { bulkCreateShiftRoster, type BulkAssignResult } from '../../../api/companyAdmin/attendance';
import type { Employee } from '../../../api/tenancy';
import { formatDisplayDate } from '../../../utils/dateDisplay';
import type { RosterGroup } from '../../../utils/rosterGrouping';

interface AddRosterEmployeesModalProps {
  group: RosterGroup;
  shiftName: string;
  employees: Employee[];
  onClose: () => void;
  onCreated: () => void;
}

// Adds more employees to an already-existing (date, shift) roster group —
// shift/date/brand are fixed (taken from the group being added to), so this
// only asks for who. Same bulkCreateShiftRoster call RosterFormModal's
// multi-select path uses, just entered from the grouped table row's "+ Add"
// button instead of the top-level Create Roster flow.
export function AddRosterEmployeesModal({ group, shiftName, employees, onClose, onCreated }: AddRosterEmployeesModalProps) {
  const alreadyAssignedIds = new Set(group.entries.map((entry) => entry.employeeId).filter((id): id is string => !!id));
  const candidateEmployees = employees.filter((employee) => !alreadyAssignedIds.has(employee.id));

  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [publishImmediately, setPublishImmediately] = useState(true);
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
      const outcome = await bulkCreateShiftRoster({
        employeeIds,
        shiftId: group.shiftId,
        brandId: group.brandId ?? undefined,
        rosterDate: group.rosterDate,
        status: publishImmediately ? 'published' : 'draft',
      });
      setResults(outcome);
      onCreated();
    } catch {
      setError('Could not add these employees. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (results) {
    const created = results.filter((r) => r.status === 'created');
    const skipped = results.filter((r) => r.status === 'skipped');
    return (
      <Modal title="Employees Added" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <Badge tone="success">{created.length} added</Badge>
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
    <Modal title="Add Employees to Roster" onClose={onClose} widthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-sm text-ink-muted">
          Adding to <span className="font-medium text-ink">{shiftName}</span> on{' '}
          <span className="font-medium text-ink">{formatDisplayDate(group.rosterDate)}</span> — already-assigned
          employees are hidden below.
        </p>
        <EmployeeMultiSelect
          label="Employees"
          employees={candidateEmployees}
          selectedIds={employeeIds}
          onChange={setEmployeeIds}
          emptyMessage="Everyone eligible is already on this roster."
        />
        {employeeIds.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={publishImmediately}
              onChange={(event) => setPublishImmediately(event.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
            />
            Publish immediately (otherwise saved as draft)
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={candidateEmployees.length === 0}>
            {employeeIds.length > 0 ? `Add ${employeeIds.length} Employee(s)` : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

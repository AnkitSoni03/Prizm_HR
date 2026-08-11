import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmployeeMultiSelect } from '../../../components/ui/EmployeeMultiSelect';
import { createShiftRoster, bulkCreateShiftRoster, type BulkAssignResult } from '../../../api/companyAdmin/attendance';
import { useAuth } from '../../../context/auth-context';
import type { Brand, Employee, Shift } from '../../../api/tenancy';

interface RosterFormModalProps {
  brands: Brand[];
  shifts: Shift[];
  employees: Employee[];
  onClose: () => void;
  onCreated: () => void;
}

export function RosterFormModal({ brands, shifts, employees, onClose, onCreated }: RosterFormModalProps) {
  const { user } = useAuth();
  // companyUsesBrands is only null for Super Admin, which never renders
  // this Company Admin component — default true is just a defensive
  // fallback, not an expected runtime path.
  const usesBrands = user?.companyUsesBrands ?? true;
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? '');
  const [rosterDate, setRosterDate] = useState('');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkAssignResult[] | null>(null);

  const scopedEmployees = usesBrands ? employees.filter((employee) => employee.brandId === brandId) : employees;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (employeeIds.length > 0) {
        // Bulk path: one roster row per selected employee, created directly
        // (defaults to published) rather than the old create-unassigned-
        // slot-then-edit-per-employee dance.
        const outcome = await bulkCreateShiftRoster({
          employeeIds,
          shiftId,
          brandId: usesBrands ? brandId : undefined,
          rosterDate,
          status: publishImmediately ? 'published' : 'draft',
        });
        setResults(outcome);
        onCreated();
        setIsSubmitting(false);
        return;
      }

      // No employees picked: fall back to the original single "unassigned
      // slot" flow — still needed to satisfy the roster-mandatory tenancy
      // gate before a Brand/Company's first employee exists.
      await createShiftRoster({ brandId: usesBrands ? brandId : undefined, shiftId, rosterDate });
      onCreated();
      onClose();
    } catch {
      setError('Could not create the roster entry. Please try again.');
      setIsSubmitting(false);
    }
  }

  if (results) {
    const created = results.filter((r) => r.status === 'created');
    const skipped = results.filter((r) => r.status === 'skipped');
    return (
      <Modal title="Roster Created" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <Badge tone="success">{created.length} created</Badge>
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
                    <p className="font-medium text-ink">{employee ? `${employee.name} (${employee.employeeCode})` : row.employeeId}</p>
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
    <Modal title="Create Roster" onClose={onClose} widthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-sm text-ink-muted">
          Pick one or more employees below to assign them directly. Leave the selection empty to create a single
          unassigned slot instead (used to satisfy the "roster before first employee" rule) — new rosters made that
          way start as <span className="font-medium text-ink">draft</span>.
        </p>
        {usesBrands && (
          <Select
            id="roster-brand"
            label="Brand"
            required
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value);
              setEmployeeIds([]);
            }}
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
        <EmployeeMultiSelect
          label="Assign to Employees (optional)"
          employees={scopedEmployees}
          selectedIds={employeeIds}
          onChange={setEmployeeIds}
          emptyMessage={usesBrands && !brandId ? 'Select a brand first.' : 'No employees found.'}
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
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={shifts.length === 0 || (usesBrands && brands.length === 0) || !rosterDate}
          >
            {employeeIds.length > 0 ? `Create Roster for ${employeeIds.length} Employee(s)` : 'Create Roster'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { EmployeeMultiSelect } from './ui/EmployeeMultiSelect';
import { GroupManagerPicker } from './ui/GroupManagerPicker';
import { apiErrorMessage } from '../utils/apiError';
import { bulkAssignHr, listEmployees } from '../api/companyAdmin/employees';
import type { Employee } from '../api/tenancy';

interface BulkAssignHrModalProps {
  // Brand Admin passes their own brand; Company Admin leaves it unset.
  brandId?: string;
  onClose: () => void;
  onDone: (updated: number) => void;
}

const PAGE = 100;

// Set (or clear) the assigned HR for many employees at once — e.g. every
// DSD employee → one HR person. Same rules as the single HR field: name only,
// any company of the Group, never the employee themselves.
export function BulkAssignHrModal({ brandId, onClose, onDone }: BulkAssignHrModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hrIds, setHrIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      const all: Employee[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const result = await listEmployees({ brandId, limit: PAGE, offset });
        all.push(...result.data);
        if (result.data.length < PAGE || all.length >= result.pagination.total) break;
      }
      return all;
    }
    loadAll()
      .then((rows) => {
        if (!cancelled) setEmployees(rows.filter((e) => e.status !== 'exited' && e.status !== 'archived'));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load employees.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const hrId = hrIds[0] ?? null;
  const candidates = employees.filter((e) => e.id !== hrId);

  async function handleSubmit(clear: boolean) {
    if (selectedIds.length === 0 || (!clear && !hrId)) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await bulkAssignHr(
        selectedIds.filter((id) => id !== hrId),
        clear ? null : hrId
      );
      onDone(result.updated);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not assign HR.'));
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Assign HR" onClose={onClose} widthClassName="max-w-lg">
      <div className="space-y-4">
        <GroupManagerPicker
          id="bulk-hr"
          label="HR"
          selectedIds={hrIds}
          onChange={setHrIds}
          placeholder="Pick the HR"
          single
          flagNoLogin
          helperText="Name only. This HR accepts or rejects these employees' resignations."
        />
        {isLoading ? (
          <p className="text-sm text-ink-muted">Loading employees…</p>
        ) : (
          <EmployeeMultiSelect
            label="Employees"
            employees={candidates}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            getNote={(e) => (e.hrEmployeeId ? (e.hrEmployeeId === hrId ? 'Already this HR' : 'Has an HR') : null)}
          />
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting || selectedIds.length === 0}
          >
            Remove HR
          </Button>
          <Button
            onClick={() => handleSubmit(false)}
            isLoading={isSubmitting}
            disabled={selectedIds.length === 0 || !hrId}
          >
            Assign to {selectedIds.length} employee{selectedIds.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

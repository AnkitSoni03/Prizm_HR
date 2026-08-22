import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { createCompOffCredit } from '../../../api/companyAdmin/approvals';
import type { Employee } from '../../../api/tenancy';
import { formatEmployeeLabel } from '../../../utils/employeeDisplay';

interface AssignCompOffModalProps {
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Manual grant via the "Assign Comp-Off" power (comp_off:credit) — the
// credit is created already status: 'approved', no separate decision step.
export function AssignCompOffModal({ employees, onClose, onSaved }: AssignCompOffModalProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [earnedDate, setEarnedDate] = useState(today());
  const [neverExpires, setNeverExpires] = useState(true);
  const [expiryDate, setExpiryDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!employeeId) {
      setError('Select an employee.');
      return;
    }
    setIsSubmitting(true);
    try {
      await createCompOffCredit({
        employeeId,
        earnedDate,
        expiryDate: neverExpires ? null : expiryDate || null,
        reason: reason.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not credit this comp-off. Please try again.';
      setError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Assign Comp-Off" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Select
          id="assign-comp-off-employee"
          label="Employee"
          required
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          placeholder="Select an employee"
          options={employees.map((e) => ({ value: e.id, label: formatEmployeeLabel(e) }))}
        />
        <Input
          id="assign-comp-off-earned-date"
          label="Earned Date"
          type="date"
          required
          value={earnedDate}
          onChange={(event) => setEarnedDate(event.target.value)}
        />

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={neverExpires}
            onChange={(event) => setNeverExpires(event.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
          />
          Never expires
        </label>

        {!neverExpires && (
          <Input
            id="assign-comp-off-expiry-date"
            label="Expiry Date"
            type="date"
            required
            value={expiryDate}
            onChange={(event) => setExpiryDate(event.target.value)}
          />
        )}

        <Input
          id="assign-comp-off-reason"
          label="Reason (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Worked the Independence Day holiday"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Assign Comp-Off
          </Button>
        </div>
      </form>
    </Modal>
  );
}

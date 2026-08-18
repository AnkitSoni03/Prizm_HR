import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { createLeaveType, updateLeaveType, type LeaveType } from '../../../api/companyAdmin/leaveBalance';

interface LeaveTypeFormModalProps {
  leaveType?: LeaveType;
  onClose: () => void;
  onSaved: (leaveType: LeaveType) => void;
}

const CYCLE_OPTIONS = [
  { value: 'calendar', label: 'Calendar Year (resets every Jan 1 – Dec 31)' },
  { value: 'anniversary', label: 'Anniversary Year (resets every year from date of joining)' },
];

const DEFAULT_ACCRUAL_OPTIONS = [
  { value: 'yearly', label: 'Yearly — full quota available immediately' },
  { value: 'monthly', label: 'Monthly — quota accrues 1/12th each month' },
  { value: 'monthly_reset', label: 'Monthly reset — use-it-or-lose-it each month' },
];

// Used both as its own "Leave Types" management page (LeaveTypesPage.tsx)
// and as the "+ Add Leave Type" shortcut inside the Add Leave Policy form
// (LeavePolicyFormModal.tsx) — same fields, same endpoint, either way.
export function LeaveTypeFormModal({ leaveType, onClose, onSaved }: LeaveTypeFormModalProps) {
  const isEdit = !!leaveType;
  const [name, setName] = useState(leaveType?.name ?? '');
  const [code, setCode] = useState(leaveType?.code ?? '');
  const [isPaid, setIsPaid] = useState(leaveType?.isPaid ?? true);
  const [carryForward, setCarryForward] = useState(leaveType?.carryForward ?? false);
  const [maxCarryForwardDays, setMaxCarryForwardDays] = useState(
    leaveType?.maxCarryForwardDays != null ? String(leaveType.maxCarryForwardDays) : ''
  );
  const [cycleType, setCycleType] = useState<LeaveType['cycleType']>(leaveType?.cycleType ?? 'calendar');
  const [defaultAccrual, setDefaultAccrual] = useState<LeaveType['defaultAccrual']>(
    leaveType?.defaultAccrual ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const maxCarryForwardValue =
        carryForward && maxCarryForwardDays.trim() !== '' ? Number(maxCarryForwardDays) : null;
      let saved: LeaveType;
      if (isEdit) {
        saved = await updateLeaveType(leaveType.id, {
          name: name.trim(),
          isPaid,
          carryForward,
          maxCarryForwardDays: maxCarryForwardValue,
          cycleType,
          defaultAccrual,
        });
      } else {
        saved = await createLeaveType({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          isPaid,
          carryForward,
          maxCarryForwardDays: maxCarryForwardValue,
          cycleType,
          defaultAccrual,
        });
      }
      onSaved(saved);
      onClose();
    } catch {
      setError(
        isEdit
          ? 'Could not update this leave type. Please try again.'
          : 'Could not create this leave type — the code may already be in use.'
      );
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Leave Type' : 'Add Leave Type'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="leave-type-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Sick Leave"
        />
        <Input
          id="leave-type-code"
          label="Code"
          required
          disabled={isEdit}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="SICK"
        />
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={isPaid}
            onChange={(event) => setIsPaid(event.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
          />
          Paid leave
        </label>

        <Select
          id="leave-type-default-accrual"
          label="Default Accrual (optional)"
          value={defaultAccrual ?? ''}
          onChange={(event) =>
            setDefaultAccrual((event.target.value || null) as LeaveType['defaultAccrual'])
          }
          placeholder="No default — set accrual per policy"
          options={DEFAULT_ACCRUAL_OPTIONS}
        />
        <p className="-mt-2 text-xs text-ink-muted">
          Just a starting point for the Add Leave Policy form — a Roster-specific policy can still pick a
          different accrual for this same leave type.
        </p>

        <Select
          id="leave-type-cycle"
          label="Leave Cycle"
          value={cycleType}
          onChange={(event) => setCycleType(event.target.value as LeaveType['cycleType'])}
          options={CYCLE_OPTIONS}
        />

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={carryForward}
            onChange={(event) => setCarryForward(event.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
          />
          Allow carry-forward to next cycle
        </label>
        {carryForward && (
          <Input
            id="leave-type-max-carry-forward"
            label="Max Carry-Forward (days)"
            type="number"
            min="0"
            step="0.5"
            value={maxCarryForwardDays}
            onChange={(event) => setMaxCarryForwardDays(event.target.value)}
            placeholder="Leave blank for unlimited"
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!name.trim() || (!isEdit && !code.trim())}>
            {isEdit ? 'Save Changes' : 'Add Leave Type'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

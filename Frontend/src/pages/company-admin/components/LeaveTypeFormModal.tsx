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
  { value: 'custom', label: 'Custom (admin-defined start date, resets every year)' },
];

const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
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
  const [customCycleStartMonth, setCustomCycleStartMonth] = useState(
    leaveType?.customCycleStartMonth != null ? String(leaveType.customCycleStartMonth) : '4'
  );
  const [customCycleStartDay, setCustomCycleStartDay] = useState(
    leaveType?.customCycleStartDay != null ? String(leaveType.customCycleStartDay) : '1'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (cycleType === 'custom' && (customCycleStartDay.trim() === '' || Number(customCycleStartDay) < 1 || Number(customCycleStartDay) > 31)) {
      setError('Custom cycle start day must be between 1 and 31.');
      return;
    }
    setIsSubmitting(true);
    try {
      const maxCarryForwardValue =
        carryForward && maxCarryForwardDays.trim() !== '' ? Number(maxCarryForwardDays) : null;
      const cyclePayload =
        cycleType === 'custom'
          ? { customCycleStartMonth: Number(customCycleStartMonth), customCycleStartDay: Number(customCycleStartDay) }
          : { customCycleStartMonth: null, customCycleStartDay: null };
      let saved: LeaveType;
      if (isEdit) {
        saved = await updateLeaveType(leaveType.id, {
          name: name.trim(),
          isPaid,
          carryForward,
          maxCarryForwardDays: maxCarryForwardValue,
          cycleType,
          ...cyclePayload,
        });
      } else {
        saved = await createLeaveType({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          isPaid,
          carryForward,
          maxCarryForwardDays: maxCarryForwardValue,
          cycleType,
          ...cyclePayload,
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
          id="leave-type-cycle"
          label="Leave Cycle"
          value={cycleType}
          onChange={(event) => setCycleType(event.target.value as LeaveType['cycleType'])}
          options={CYCLE_OPTIONS}
        />
        {cycleType === 'custom' && (
          <div className="flex gap-2">
            <Select
              id="leave-type-custom-cycle-month"
              label="Starts every"
              value={customCycleStartMonth}
              onChange={(event) => setCustomCycleStartMonth(event.target.value)}
              options={MONTH_OPTIONS}
            />
            <Input
              id="leave-type-custom-cycle-day"
              label="Day"
              type="number"
              min={1}
              max={31}
              step={1}
              value={customCycleStartDay}
              onChange={(event) => setCustomCycleStartDay(event.target.value)}
              className="w-24"
            />
          </div>
        )}

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

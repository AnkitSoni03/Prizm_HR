import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { toTimeInputValue } from '../utils/dateDisplay';
import type { AttendanceRegularization } from '../api/companyAdmin/approvals';

interface ApproveRegularizationModalProps {
  regularization: AttendanceRegularization;
  onClose: () => void;
  onConfirm: (overrides: { checkInTime?: string; checkOutTime?: string }) => Promise<void> | void;
}

// Lets the approver review — and, if needed, correct — the employee's
// requested check-in/check-out time before it's written onto the Attendance
// row (see attendanceRegularization.service.js::approveRegularization).
// Pre-filled with whatever the employee asked for, blank if they didn't
// specify a time at all; leaving a field blank on submit means that side of
// the punch is left untouched, same as if it had never been requested.
export function ApproveRegularizationModal({ regularization, onClose, onConfirm }: ApproveRegularizationModalProps) {
  const [checkInTime, setCheckInTime] = useState(toTimeInputValue(regularization.requestedCheckIn));
  const [checkOutTime, setCheckOutTime] = useState(toTimeInputValue(regularization.requestedCheckOut));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm({ checkInTime: checkInTime || undefined, checkOutTime: checkOutTime || undefined });
    } catch {
      setError('Could not approve this request.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Approve attendance correction" onClose={onClose} widthClassName="max-w-sm" compact>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Review the check-in/check-out time before approving — adjust it if needed. Leaving a field
          blank leaves that punch as recorded.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            id="approve-reg-check-in"
            type="time"
            label="Check-In Time"
            value={checkInTime}
            onChange={(event) => setCheckInTime(event.target.value)}
          />
          <Input
            id="approve-reg-check-out"
            type="time"
            label="Check-Out Time"
            value={checkOutTime}
            onChange={(event) => setCheckOutTime(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            Approve
          </Button>
        </div>
      </div>
    </Modal>
  );
}

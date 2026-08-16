import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface RejectReasonModalProps {
  title: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

// Shared by every approve/reject list (leave, OD, regularization, comp-off,
// company-admin + brand-admin + ESS team approvals) so a rejection reason is
// always mandatory and always lands in the approval_histories audit trail
// (see leaveRequest.service.js::rejectLeaveRequest and its siblings) instead
// of the old window.confirm() flow, which never collected one at all.
export function RejectReasonModal({ title, onClose, onConfirm }: RejectReasonModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch {
      setError('Could not reject this request.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} widthClassName="max-w-sm" compact>
      <div className="space-y-4">
        <div>
          <label htmlFor="reject-reason" className="mb-1.5 block text-sm font-medium text-ink">
            Reason for rejection
          </label>
          <textarea
            id="reject-reason"
            rows={3}
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Let the employee know why this was rejected"
            className="w-full rounded-xl border border-border px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleSubmit} isLoading={isSubmitting} disabled={!reason.trim()}>
            Reject
          </Button>
        </div>
      </div>
    </Modal>
  );
}

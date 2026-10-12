import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { apiErrorMessage } from '../utils/apiError';
import { formatEmployeeLabel } from '../utils/employeeDisplay';
import { decideResignation, type Resignation } from '../api/resignations';

interface DecideResignationModalProps {
  resignation: Resignation;
  action: 'accept' | 'reject';
  onClose: () => void;
  onDone: () => void;
}

// HR's accept/reject. A comment is optional on accept, required on reject.
// Accept can also set the final last working day (defaults to the
// employee's requested one).
export function DecideResignationModal({ resignation, action, onClose, onDone }: DecideResignationModalProps) {
  const [comment, setComment] = useState('');
  const [lastWorkingDate, setLastWorkingDate] = useState(resignation.requestedLastWorkingDate ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isReject = action === 'reject';
  const name = resignation.employee ? formatEmployeeLabel(resignation.employee) : 'this employee';

  async function handleSubmit() {
    if (isReject && !comment.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await decideResignation(resignation.id, {
        action,
        comment: comment.trim() || undefined,
        lastWorkingDate: !isReject && lastWorkingDate ? lastWorkingDate : undefined,
      });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save your decision.'));
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      title={isReject ? 'Reject resignation' : 'Accept resignation'}
      onClose={onClose}
      widthClassName="max-w-md"
      compact
    >
      <div className="space-y-4">
        <p className="text-sm text-ink">
          {isReject ? 'Reject' : 'Accept'} the resignation of <span className="font-medium">{name}</span>. They will be
          notified on their dashboard and by email.
        </p>
        {!isReject && (
          <Input
            id="resignation-lwd"
            type="date"
            label="Last working day (optional)"
            value={lastWorkingDate}
            onChange={(event) => setLastWorkingDate(event.target.value)}
          />
        )}
        <div>
          <label htmlFor="resignation-comment" className="mb-1.5 block text-sm font-medium text-ink">
            {isReject ? 'Reason for rejection' : 'Comment (optional)'}
          </label>
          <textarea
            id="resignation-comment"
            rows={4}
            autoFocus
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={isReject ? 'Let the employee know why' : 'Anything you want to tell the employee'}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={isReject ? 'danger' : 'primary'}
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={isReject && !comment.trim()}
          >
            {isReject ? 'Reject' : 'Accept'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

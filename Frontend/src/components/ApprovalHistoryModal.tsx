import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
import { Skeleton } from './ui/Skeleton';
import { describeApprover, type ApprovalHistoryEntry } from '../api/companyAdmin/approvals';
import { formatDisplayDateTime } from '../utils/dateDisplay';

interface ApprovalHistoryModalProps {
  title: string;
  onClose: () => void;
  load: () => Promise<ApprovalHistoryEntry[]>;
}

// Read-side of the approval_histories audit trail (see
// utils/approvalHistory.js::listApprovalHistory on the backend) — an
// immutable, timestamped record of every approve/reject decision made on a
// leave/OD/regularization/comp-off request, independent of the mutable
// status/approver columns on the request row itself.
export function ApprovalHistoryModal({ title, onClose, load }: ApprovalHistoryModalProps) {
  const [entries, setEntries] = useState<ApprovalHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    load()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load approval history.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {!isLoading && error && <p className="text-sm text-danger">{error}</p>}
        {!isLoading && !error && entries.length === 0 && (
          <p className="text-sm text-ink-muted">No decision has been recorded for this request yet.</p>
        )}
        {!isLoading &&
          !error &&
          entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={entry.action === 'rejected' ? 'danger' : 'success'}>{entry.action}</Badge>
                <span className="text-xs text-ink-muted">{formatDisplayDateTime(entry.decidedAt)}</span>
              </div>
              <p className="mt-2 text-sm text-ink">By {describeApprover(entry.actorUser)}</p>
              {entry.reason && <p className="mt-1 text-sm text-ink-muted">Reason: {entry.reason}</p>}
            </div>
          ))}
      </div>
    </Modal>
  );
}

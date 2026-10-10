import { useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import { Ban, CalendarX, Check, CheckCheck, CheckCircle2, History, Hourglass, Undo2, X, XCircle } from 'lucide-react';
import { Avatar } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { DetailRow } from './ui/DetailRow';
import { Modal } from './ui/Modal';
import { Skeleton } from './ui/Skeleton';

// Shared by every approvals-shaped list (Company/Brand Admin's ApprovalsPage,
// ESS's TeamApprovalsPage) so the request-status vocabulary (tone + icon)
// stays in one place instead of drifting between the two near-duplicate
// pages.
const REQUEST_STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  revoked: 'danger',
  expired: 'neutral',
  used: 'neutral',
};

const STATUS_ICON: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  pending: Hourglass,
  pending_approval: Hourglass,
  approved: CheckCircle2,
  rejected: XCircle,
  cancelled: Ban,
  revoked: Undo2,
  expired: CalendarX,
  used: CheckCheck,
};

export function RequestStatusBadge({ status, rejectionReason }: { status: string; rejectionReason?: string | null }) {
  const Icon = STATUS_ICON[status] ?? Hourglass;
  return (
    <Badge
      tone={REQUEST_STATUS_TONE[status] ?? 'neutral'}
      title={status === 'rejected' || status === 'revoked' ? rejectionReason ?? undefined : undefined}
    >
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        {status === 'revoked' ? 'reverted' : status.replace('_', ' ')}
      </span>
    </Badge>
  );
}

export interface RequestCardField {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: ReactNode;
}

interface RequestCardProps {
  name: string;
  photoUrl?: string | null;
  // Short colored-dot subtitle under the name (leave type, OD purpose,
  // requested regularization status) — omit for a request type with no
  // natural single-line summary (comp-off credits).
  tag?: string | null;
  status: string;
  rejectionReason?: string | null;
  fields: RequestCardField[];
  canApprove: boolean;
  canReject: boolean;
  onApprove: () => void;
  onReject: () => void;
  onHistory: () => void;
  // Admin-only "Revert" on an already-approved leave request.
  canRevert?: boolean;
  onRevert?: () => void;
}

// Mobile-first card for one pending/decided request — avatar + name + status
// up top, the same fields the desktop Table's columns show as label/value
// rows below, then always-visible colored History/Approve/Reject actions
// (a touch-friendly professional alternative to Table.tsx's generic
// label/value mobile fallback and icon-only desktop action buttons).
export function RequestCard({
  name,
  photoUrl,
  tag,
  status,
  rejectionReason,
  fields,
  canApprove,
  canReject,
  onApprove,
  onReject,
  onHistory,
  canRevert = false,
  onRevert,
}: RequestCardProps) {
  // The card cuts long values (a reason, a revert reason) to one line —
  // clicking it opens every field in full.
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsDetailOpen(true);
    }
  }

  // Shared by the card and the detail pop-up. Each action closes the pop-up
  // first so the next modal (reject reason, history...) isn't stacked on it.
  function renderActions(fromDetail: boolean) {
    const run = (action?: () => void) => () => {
      if (fromDetail) setIsDetailOpen(false);
      action?.();
    };
    return (
      <>
        <button
          type="button"
          onClick={run(onHistory)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-light"
        >
          <History className="h-3.5 w-3.5" strokeWidth={1.75} />
          History
        </button>
        {canApprove && (
          <button
            type="button"
            onClick={run(onApprove)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/10"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
            Approve
          </button>
        )}
        {canReject && (
          <button
            type="button"
            onClick={run(onReject)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            Reject
          </button>
        )}
        {canRevert && (
          <button
            type="button"
            onClick={run(onRevert)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Revert
          </button>
        )}
      </>
    );
  }

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsDetailOpen(true)}
      onKeyDown={handleCardKeyDown}
      title="View full details"
      className="cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={photoUrl} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{name}</p>
            {tag && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span className="truncate">{tag}</span>
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <RequestStatusBadge status={status} rejectionReason={rejectionReason} />
        </div>
      </div>

      <div className="mt-4 space-y-2.5 border-t border-border pt-3.5">
        {fields.map((field) => (
          <DetailRow key={field.label} icon={field.icon} label={field.label} value={field.value} />
        ))}
      </div>

      {/* Buttons act on their own — they mustn't also open the pop-up. */}
      <div
        className="mt-3.5 flex items-center gap-1 border-t border-border pt-3"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {renderActions(false)}
      </div>
    </div>

    {/* Outside the clickable card: clicks inside the pop-up (e.g. its close
        button) would otherwise bubble up and re-open it. */}
    {isDetailOpen && (
      <Modal title="Request details" onClose={() => setIsDetailOpen(false)} widthClassName="max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar src={photoUrl} size="lg" />
            <div className="min-w-0">
              <p className="break-words text-[15px] font-semibold text-ink">{name}</p>
              {tag && <p className="mt-0.5 break-words text-xs text-ink-muted">{tag}</p>}
            </div>
          </div>
          <div className="shrink-0">
            <RequestStatusBadge status={status} rejectionReason={rejectionReason} />
          </div>
        </div>

        <dl className="mt-4 divide-y divide-border border-t border-border">
          {fields.map((field) => {
            const Icon = field.icon;
            return (
              <div key={field.label} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2.5 text-sm max-[400px]:grid-cols-1 max-[400px]:gap-1">
                <dt className="flex items-center gap-1.5 text-ink-muted">
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  {field.label}
                </dt>
                <dd className="min-w-0 whitespace-pre-line break-words font-medium text-ink">{field.value}</dd>
              </div>
            );
          })}
        </dl>

        <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">{renderActions(true)}</div>
      </Modal>
    )}
    </>
  );
}

export function RequestCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <div className="mt-4 space-y-2.5 border-t border-border pt-3.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </>
  );
}

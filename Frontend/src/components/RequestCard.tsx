import type { ComponentType, ReactNode } from 'react';
import { Ban, CalendarX, Check, CheckCheck, CheckCircle2, History, Hourglass, X, XCircle } from 'lucide-react';
import { Avatar } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { DetailRow } from './ui/DetailRow';
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
  expired: 'neutral',
  used: 'neutral',
};

const STATUS_ICON: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  pending: Hourglass,
  pending_approval: Hourglass,
  approved: CheckCircle2,
  rejected: XCircle,
  cancelled: Ban,
  expired: CalendarX,
  used: CheckCheck,
};

export function RequestStatusBadge({ status, rejectionReason }: { status: string; rejectionReason?: string | null }) {
  const Icon = STATUS_ICON[status] ?? Hourglass;
  return (
    <Badge
      tone={REQUEST_STATUS_TONE[status] ?? 'neutral'}
      title={status === 'rejected' ? rejectionReason ?? undefined : undefined}
    >
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        {status.replace('_', ' ')}
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
}: RequestCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
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

      <div className="mt-3.5 flex items-center gap-1 border-t border-border pt-3">
        <button
          type="button"
          onClick={onHistory}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-light"
        >
          <History className="h-3.5 w-3.5" strokeWidth={1.75} />
          History
        </button>
        {canApprove && (
          <button
            type="button"
            onClick={onApprove}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/10"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
            Approve
          </button>
        )}
        {canReject && (
          <button
            type="button"
            onClick={onReject}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            Reject
          </button>
        )}
      </div>
    </div>
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

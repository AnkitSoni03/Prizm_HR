import { Check, Clock, ShieldCheck, X } from 'lucide-react';
import { Badge } from './ui/Badge';
import type { ManagerApprovalRow } from '../utils/managerApproval';

function managerLabel(row: ManagerApprovalRow): string {
  return row.manager?.name || row.manager?.employeeCode || 'Unknown manager';
}

const STATUS_ICON: Record<ManagerApprovalRow['status'], typeof Check> = {
  approved: Check,
  rejected: X,
  pending: Clock,
  bypassed: ShieldCheck,
};

const STATUS_COLOR: Record<ManagerApprovalRow['status'], string> = {
  approved: 'text-success',
  rejected: 'text-danger',
  pending: 'text-warning',
  bypassed: 'text-ink-muted',
};

const STATUS_LABEL: Record<ManagerApprovalRow['status'], string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  pending: 'Waiting',
  bypassed: 'Bypassed',
};

interface ManagerApprovalStatusProps {
  approvals?: ManagerApprovalRow[];
  decisionMode?: 'manager_consensus' | 'admin_override' | null;
  // 'compact' — a row of small chips, for a table cell. 'list' — one line
  // per manager with a text label, for a card or detail view.
  variant?: 'compact' | 'list';
}

// Full transparency on WHO decided (or hasn't yet decided) a multi-manager
// leave request — every manager snapshotted at submission time, each one's
// current status, and — when an admin bypassed the chain entirely — a clear
// note saying so instead of a misleading "still pending" look. Used by
// MyLeavePage (the employee's own view), TeamApprovalsPage (a manager's
// view of their co-managers), and the Company/Brand Admin Approvals page.
export function ManagerApprovalStatus({ approvals, decisionMode, variant = 'compact' }: ManagerApprovalStatusProps) {
  if (!approvals || approvals.length === 0) {
    return <span className="text-xs text-ink-muted">No managers assigned</span>;
  }

  if (decisionMode === 'admin_override') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        Decided directly by an admin
      </span>
    );
  }

  if (variant === 'list') {
    return (
      <ul className="space-y-1">
        {approvals.map((row) => {
          const Icon = STATUS_ICON[row.status];
          return (
            <li key={row.id} className="flex items-center gap-2 text-sm">
              <Icon className={`h-3.5 w-3.5 shrink-0 ${STATUS_COLOR[row.status]}`} strokeWidth={2} />
              <span className="text-ink">{managerLabel(row)}</span>
              <Badge
                tone={row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : row.status === 'pending' ? 'warning' : 'neutral'}
                title={row.status === 'rejected' ? row.reason ?? undefined : undefined}
              >
                {STATUS_LABEL[row.status]}
              </Badge>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {approvals.map((row) => {
        const Icon = STATUS_ICON[row.status];
        return (
          <span
            key={row.id}
            title={`${managerLabel(row)}: ${STATUS_LABEL[row.status]}${row.status === 'rejected' && row.reason ? ` — ${row.reason}` : ''}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-page px-2 py-0.5 text-[11px] font-medium text-ink"
          >
            <Icon className={`h-3 w-3 shrink-0 ${STATUS_COLOR[row.status]}`} strokeWidth={2.25} />
            {managerLabel(row)}
          </span>
        );
      })}
    </div>
  );
}

import type { ReactNode } from 'react';
import { Building2, CalendarX, MessageSquare, UserCheck, UserRound } from 'lucide-react';
import { RequestCard } from './ui/RequestCard';
import { Badge } from './ui/Badge';
import { formatDisplayDate } from '../utils/dateDisplay';
import { formatEmployeeLabel } from '../utils/employeeDisplay';
import type { Resignation } from '../api/resignations';

const STATUS_TONE: Record<Resignation['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

interface ResignationCardProps {
  resignation: Resignation;
  // Reviewer lists show whose resignation it is; the employee's own list doesn't.
  showEmployee?: boolean;
  footer?: ReactNode;
}

// One resignation, shared by the ESS page (own + team) and the admin list.
export function ResignationCard({ resignation: r, showEmployee = false, footer }: ResignationCardProps) {
  const employee = r.employee;
  const org = [employee?.company?.name, employee?.brand?.name].filter(Boolean).join(' › ');
  const hrName = employee?.hrEmployee ? formatEmployeeLabel(employee.hrEmployee) : null;

  return (
    <RequestCard
      icon={CalendarX}
      iconClassName="bg-danger/10 text-danger"
      title={showEmployee && employee ? formatEmployeeLabel(employee) : 'Resignation'}
      status={<Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>}
      footer={footer}
    >
      {showEmployee && org && (
        <div className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {org}
          {employee?.designation?.title ? ` · ${employee.designation.title}` : ''}
        </div>
      )}
      <p className="text-xs text-ink-muted">Submitted {formatDisplayDate(r.createdAt.slice(0, 10))}</p>
      {r.requestedLastWorkingDate && (
        <p className="text-sm text-ink">
          Requested last day: <span className="font-medium">{formatDisplayDate(r.requestedLastWorkingDate)}</span>
        </p>
      )}
      {r.status === 'accepted' && r.lastWorkingDate && (
        <p className="text-sm text-ink">
          Final last working day: <span className="font-medium">{formatDisplayDate(r.lastWorkingDate)}</span>
        </p>
      )}
      <p className="whitespace-pre-line text-sm text-ink">
        <span className="text-ink-muted">Reason: </span>
        {r.reason}
      </p>
      {showEmployee && (
        <div className="flex items-center gap-1.5 text-sm text-ink-muted">
          <UserRound className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {hrName ? `HR: ${hrName}` : <span className="text-warning">No HR assigned</span>}
        </div>
      )}
      {(r.status === 'accepted' || r.status === 'rejected') && (
        <div className="space-y-1 border-t border-border pt-2">
          {r.decidedByEmployee && (
            <div className="flex items-center gap-1.5 text-sm text-ink-muted">
              <UserCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              {r.status === 'accepted' ? 'Accepted' : 'Rejected'} by {formatEmployeeLabel(r.decidedByEmployee)}
              {r.decidedAt ? ` on ${formatDisplayDate(r.decidedAt.slice(0, 10))}` : ''}
            </div>
          )}
          {r.decisionComment && (
            <div className="flex items-start gap-1.5 text-sm text-ink">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
              <span className="whitespace-pre-line">{r.decisionComment}</span>
            </div>
          )}
        </div>
      )}
    </RequestCard>
  );
}

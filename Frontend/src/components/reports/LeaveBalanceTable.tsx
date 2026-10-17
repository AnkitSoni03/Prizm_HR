import type { ReportLeaveBalance } from '../../api/employeeMonthlyReport';
import { formatDisplayDate } from '../../utils/dateDisplay';

// Assigned leave types + current balance, for the Monthly Report views.
// `rows` may carry an employee label (combined report) — shown as the first
// column when any row has one.

export interface LeaveBalanceRow extends ReportLeaveBalance {
  employeeLabel?: string;
}

function note(b: ReportLeaveBalance): string {
  if (b.linkedToName) return `Uses ${b.linkedToName} balance`;
  if (!b.periodStart) return '';
  return `${formatDisplayDate(b.periodStart)} – ${b.periodEnd ? formatDisplayDate(b.periodEnd) : 'open'}`;
}

export function LeaveBalanceTable({ rows }: { rows: LeaveBalanceRow[] }) {
  const withEmployee = rows.some((r) => r.employeeLabel);
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-page text-ink-muted">
          <tr>
            {withEmployee && <th className="px-3 py-2 font-medium">Employee</th>}
            <th className="px-3 py-2 font-medium">Leave Type</th>
            <th className="px-3 py-2 font-medium">Assigned</th>
            <th className="px-3 py-2 font-medium">Carried Fwd</th>
            <th className="px-3 py-2 font-medium">Used</th>
            <th className="px-3 py-2 font-medium">Balance</th>
            <th className="px-3 py-2 font-medium">Period</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr key={`${b.employeeLabel ?? ''}-${b.leaveTypeName}-${i}`} className="border-t border-border text-ink">
              {withEmployee && <td className="whitespace-nowrap px-3 py-1.5">{b.employeeLabel}</td>}
              <td className="whitespace-nowrap px-3 py-1.5">
                {b.leaveTypeName}
                {!b.isPaid && <span className="text-ink-muted"> (unpaid)</span>}
              </td>
              <td className="px-3 py-1.5">{b.isUnlimited ? 'Unlimited' : (b.allotted ?? 0)}</td>
              <td className="px-3 py-1.5">{b.carriedForward ?? 0}</td>
              <td className="px-3 py-1.5">{b.used ?? 0}</td>
              <td className="px-3 py-1.5 font-semibold text-success">{b.isUnlimited ? 'Unlimited' : (b.balance ?? 0)}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-ink-muted">{note(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

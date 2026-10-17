import { Fragment, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/Badge';
import type { EmployeePeriodReport } from '../../api/employeeReports';
import { formatDisplayDate, formatDisplayDateRange, formatDisplayTime } from '../../utils/dateDisplay';
import { formatDuration } from '../../utils/workingHours';

// On-screen view of a combined Monthly Report (several employees x picked months).
// One row per employee with period totals; click a row for its month-by-month
// breakdown. Below: every leave / OD / regularization / comp-off in the period.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HALF_LABEL = { first_half: 'First half', second_half: 'Second half' } as const;
const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  on_duty: 'On Duty',
  half_day: 'Half Day',
  leave: 'Leave',
  absent: 'Absent',
  holiday: 'Holiday',
  weekoff: 'Week Off',
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number | null | undefined) => (n == null ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

function requestTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'approved' || status === 'used') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected' || status === 'revoked' || status === 'expired') return 'danger';
  return 'neutral';
}

function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 text-left font-medium">{children}</th>;
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-3 py-1.5 ${className}`}>{children}</td>;
}

function Collapsible({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-ink"
      >
        <span>
          {title} <span className="font-normal text-ink-muted">({count})</span>
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-ink-muted" /> : <ChevronRight className="h-4 w-4 text-ink-muted" />}
      </button>
      {open && <div className="overflow-x-auto border-t border-border">{children}</div>}
    </div>
  );
}

export function EmployeePeriodReportView({ report, showEmployeeColumn = true }: { report: EmployeePeriodReport; showEmployeeColumn?: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(report.rows.length === 1 ? [report.rows[0].employee.id] : []));
  const anyPayroll = report.rows.some((r) => r.payrollVisible);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const empCell = (name: string, code: string | null) => (
    <>
      {name}
      {code && <span className="text-ink-muted"> ({code})</span>}
    </>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        {report.months.map((m) => `${MONTHS[m.month - 1]} ${m.year}`).join(', ')} · figures up to {formatDisplayDate(report.asOf)} ·{' '}
        {report.rows.length} employee{report.rows.length === 1 ? '' : 's'}
        {report.skipped > 0 && ` · ${report.skipped} skipped (not in your scope)`}
      </p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-page text-ink-muted">
            <tr>
              <Th>Employee</Th>
              <Th>Payable</Th>
              <Th>LOP</Th>
              <Th>Present</Th>
              <Th>OD</Th>
              <Th>Half Day</Th>
              <Th>Leave</Th>
              <Th>Absent</Th>
              <Th>Hol / WO</Th>
              <Th>Missed Out</Th>
              <Th>Hours</Th>
              {anyPayroll && <Th>Net Pay</Th>}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => {
              const t = row.totals;
              const open = expanded.has(row.employee.id);
              return (
                <Fragment key={row.employee.id}>
                  <tr className="cursor-pointer border-t border-border hover:bg-page" onClick={() => toggle(row.employee.id)}>
                    <Td className="text-ink">
                      <span className="inline-flex items-center gap-1">
                        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        <span>
                          {empCell(row.employee.name ?? '—', row.employee.employeeCode)}
                          {showEmployeeColumn && (row.employee.companyName || row.employee.brandName) && (
                            <span className="block text-[11px] text-ink-muted">
                              {[row.employee.companyName, row.employee.brandName].filter(Boolean).join(' › ')}
                            </span>
                          )}
                        </span>
                      </span>
                    </Td>
                    <Td className="font-semibold text-success">{r2(t.payableDays)}</Td>
                    <Td className={t.lopDays > 0 ? 'font-semibold text-danger' : 'text-ink'}>{r2(t.lopDays)}</Td>
                    <Td className="text-ink">{t.present}</Td>
                    <Td className="text-ink">{t.onDuty}</Td>
                    <Td className="text-ink">{t.halfDay}</Td>
                    <Td className="text-ink">
                      {t.leave}
                      {t.unpaidLeave > 0 && <span className="text-ink-muted"> ({r2(t.unpaidLeave)} unpaid)</span>}
                    </Td>
                    <Td className="text-ink">{t.absent}</Td>
                    <Td className="text-ink">
                      {t.holiday} / {t.weekoff}
                    </Td>
                    <Td className={t.missedCheckouts > 0 ? 'text-warning' : 'text-ink'}>{t.missedCheckouts}</Td>
                    <Td className="text-ink">{formatDuration(t.workedMinutes)}</Td>
                    {anyPayroll && <Td className="text-ink">{row.payrollVisible ? money(t.netPay) : '—'}</Td>}
                  </tr>
                  {open &&
                    row.months.map((m) => (
                      <tr key={`${row.employee.id}-${m.year}-${m.month}`} className="bg-page/60 text-ink-muted">
                        <Td className="pl-9">
                          {MONTHS[m.month - 1]} {m.year}
                        </Td>
                        {!m.available ? (
                          <td colSpan={anyPayroll ? 11 : 10} className="px-3 py-1.5 text-[11px]">
                            No data (not joined yet / upcoming)
                          </td>
                        ) : (
                          <>
                            <Td className="text-success">{r2(m.payableDays)}</Td>
                            <Td className={m.lopDays > 0 ? 'text-danger' : ''}>
                              {r2(m.lopDays)}
                              {m.lopDates.length > 0 && <span className="block max-w-56 truncate text-[11px]" title={m.lopDates.join(', ')}>{m.lopDates.join(', ')}</span>}
                            </Td>
                            <Td>{m.present}</Td>
                            <Td>{m.onDuty}</Td>
                            <Td>{m.halfDay}</Td>
                            <Td>{m.leave}</Td>
                            <Td>{m.absent}</Td>
                            <Td>
                              {m.holiday} / {m.weekoff}
                            </Td>
                            <Td>{m.missedCheckouts}</Td>
                            <Td>{formatDuration(m.workedMinutes)}</Td>
                            {anyPayroll && (
                              <Td>
                                {!m.payroll ? '—' : m.payroll.generated ? money(m.payroll.netPay) : <span className="text-[11px]">Not generated</span>}
                              </Td>
                            )}
                          </>
                        )}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <Collapsible title="Leave Requests" count={report.leaveRequests.length}>
          <table className="w-full text-xs">
            <thead className="bg-page text-ink-muted">
              <tr>
                {showEmployeeColumn && <Th>Employee</Th>}
                <Th>Leave</Th>
                <Th>Dates</Th>
                <Th>Days</Th>
                <Th>Status</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {report.leaveRequests.map((r) => (
                <tr key={r.id} className="border-t border-border text-ink">
                  {showEmployeeColumn && <Td>{empCell(r.employeeName, r.employeeCode)}</Td>}
                  <Td>
                    {r.leaveTypeName}
                    {!r.isPaid && <span className="text-ink-muted"> (unpaid)</span>}
                    {r.halfDaySession && <span className="text-ink-muted"> · {HALF_LABEL[r.halfDaySession]}</span>}
                  </Td>
                  <Td>{formatDisplayDateRange(r.fromDate, r.toDate)}</Td>
                  <Td>{r.days ?? '—'}</Td>
                  <Td>
                    <Badge tone={requestTone(r.status)}>{r.status}</Badge>
                  </Td>
                  <td className="px-3 py-1.5">
                    {r.reason ?? '—'}
                    {r.rejectionReason && <span className="block text-danger">{r.rejectionReason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Collapsible>

        <Collapsible title="OD Requests" count={report.odRequests.length}>
          <table className="w-full text-xs">
            <thead className="bg-page text-ink-muted">
              <tr>
                {showEmployeeColumn && <Th>Employee</Th>}
                <Th>Purpose</Th>
                <Th>Dates</Th>
                <Th>Location</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {report.odRequests.map((r) => (
                <tr key={r.id} className="border-t border-border text-ink">
                  {showEmployeeColumn && <Td>{empCell(r.employeeName, r.employeeCode)}</Td>}
                  <td className="px-3 py-1.5">
                    {r.purpose}
                    {r.rejectionReason && <span className="block text-danger">{r.rejectionReason}</span>}
                  </td>
                  <Td>{formatDisplayDateRange(r.fromDate, r.toDate)}</Td>
                  <Td>{r.location ?? '—'}</Td>
                  <Td>
                    <Badge tone={requestTone(r.status)}>{r.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Collapsible>

        <Collapsible title="Regularizations" count={report.regularizations.length}>
          <table className="w-full text-xs">
            <thead className="bg-page text-ink-muted">
              <tr>
                {showEmployeeColumn && <Th>Employee</Th>}
                <Th>Date</Th>
                <Th>Requested</Th>
                <Th>Times</Th>
                <Th>Status</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {report.regularizations.map((r) => (
                <tr key={r.id} className="border-t border-border text-ink">
                  {showEmployeeColumn && <Td>{empCell(r.employeeName, r.employeeCode)}</Td>}
                  <Td>{formatDisplayDate(r.date)}</Td>
                  <Td>{STATUS_LABEL[r.requestedStatus] ?? r.requestedStatus}</Td>
                  <Td>
                    {r.requestedCheckIn || r.requestedCheckOut
                      ? `${formatDisplayTime(r.requestedCheckIn)} → ${formatDisplayTime(r.requestedCheckOut)}`
                      : '—'}
                  </Td>
                  <Td>
                    <Badge tone={requestTone(r.status)}>{r.status}</Badge>
                  </Td>
                  <td className="px-3 py-1.5">
                    {r.reason ?? '—'}
                    {r.rejectionReason && <span className="block text-danger">{r.rejectionReason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Collapsible>

        <Collapsible title="Comp-Off Earned" count={report.compOffCredits.length}>
          <table className="w-full text-xs">
            <thead className="bg-page text-ink-muted">
              <tr>
                {showEmployeeColumn && <Th>Employee</Th>}
                <Th>Earned On</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {report.compOffCredits.map((c) => (
                <tr key={c.id} className="border-t border-border text-ink">
                  {showEmployeeColumn && <Td>{empCell(c.employeeName, c.employeeCode)}</Td>}
                  <Td>{formatDisplayDate(c.earnedDate)}</Td>
                  <Td>{formatDisplayDate(c.expiryDate)}</Td>
                  <Td>
                    <Badge tone={requestTone(c.status)}>{c.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Collapsible>
      </div>
    </div>
  );
}

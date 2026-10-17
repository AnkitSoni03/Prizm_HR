import { useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import {
  getEmployeeMonthlyReport,
  type EmployeeMonthlyReport as Report,
  type ReportDayStatus,
} from '../../api/employeeMonthlyReport';
import { formatDisplayDate, formatDisplayDateRange, formatDisplayTime } from '../../utils/dateDisplay';
import { workingHoursLabel, formatDuration } from '../../utils/workingHours';

// Detailed one-employee, one-month view of the Monthly Report page
// (pages/reports/EmployeeReportsPage.tsx) — shown when exactly one employee
// and one month are picked. Admins only; the backend refuses Super Admin.

const STATUS_LABEL: Record<ReportDayStatus, string> = {
  present: 'Present',
  on_duty: 'On Duty',
  half_day: 'Half Day',
  leave: 'Leave',
  absent: 'Absent',
  holiday: 'Holiday',
  weekoff: 'Week Off',
};

const STATUS_CLASS: Record<ReportDayStatus, string> = {
  present: 'text-success',
  on_duty: 'text-success',
  half_day: 'text-warning',
  leave: 'text-primary',
  absent: 'text-danger',
  holiday: 'text-ink-muted',
  weekoff: 'text-ink-muted',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const HALF_LABEL = { first_half: 'First half', second_half: 'Second half' } as const;

function requestTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'approved' || status === 'used') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected' || status === 'revoked' || status === 'expired') return 'danger';
  return 'neutral';
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number | null) => (n == null ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);


function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'success' | 'danger' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-xl border border-border bg-page px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
        {count != null && <span className="ml-1 font-normal normal-case">({count})</span>}
      </p>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-ink-muted">{text}</p>;
}

export function MonthlyReportDetail({ employeeId, year, month }: { employeeId: string; year: number; month: number }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const key = `${employeeId}:${year}-${month}`;
  const isLoading = loadedKey !== key;

  useEffect(() => {
    let cancelled = false;
    const loadKey = `${employeeId}:${year}-${month}`;
    getEmployeeMonthlyReport(employeeId, year, month)
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setError(null);
        setLoadedKey(loadKey);
      })
      .catch((err) => {
        if (cancelled) return;
        setReport(null);
        setError(
          axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
            ? err.response.data.error
            : 'Could not load the report.'
        );
        setLoadedKey(loadKey);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, year, month]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error) return <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>;
  if (!report) return null;
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ink">
        {report.employee.name ?? '—'}
        {report.employee.employeeCode && <span className="font-normal text-ink-muted"> ({report.employee.employeeCode})</span>}
        <span className="font-normal text-ink-muted">
          {' '}
          · {MONTH_NAMES[month - 1]} {year}
        </span>
      </p>
      <ReportBody report={report} isFutureMonth={false} />
    </div>
  );
}

function ReportBody({ report, isFutureMonth }: { report: Report; isFutureMonth: boolean }) {
  const e = report.employee;
  const s = report.summary;
  const p = report.payroll;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border bg-page px-4 py-3 text-sm">
        <p className="text-ink-muted">Department</p>
        <p className="text-ink">{e.departmentName ?? '—'}</p>
        <p className="text-ink-muted">Designation</p>
        <p className="text-ink">{e.designationName ?? '—'}</p>
        <p className="text-ink-muted">Shift</p>
        <p className="text-ink">{[e.shiftName, e.shiftTime].filter(Boolean).join(' · ') || '—'}</p>
        <p className="text-ink-muted">Roster</p>
        <p className="text-ink">{e.rosterName ?? '—'}</p>
        <p className="text-ink-muted">Manager</p>
        <p className="text-ink">{e.managerName ?? '—'}</p>
        {e.lastWorkingDate && (
          <>
            <p className="text-ink-muted">Last Working Day</p>
            <p className="text-ink">{formatDisplayDate(e.lastWorkingDate)}</p>
          </>
        )}
      </div>

      {isFutureMonth ? (
        <Empty text="This month hasn't started yet." />
      ) : (
        <>
          <p className="text-xs text-ink-muted">Figures up to {formatDisplayDate(report.asOf)}.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Payable Days" value={round2(s.payableDays)} tone="success" />
            <Stat label="LOP Days" value={round2(s.lopDays)} tone={s.lopDays > 0 ? 'danger' : undefined} />
            <Stat label="Working Hours" value={formatDuration(s.workedMinutes)} />
            <Stat label="Missed Checkouts" value={s.missedCheckouts} />
            <Stat label="Present" value={s.present} />
            <Stat label="On Duty" value={s.onDuty} />
            <Stat label="Half Day" value={s.halfDay} />
            <Stat label="Absent" value={s.absent} />
            <Stat label="Leave" value={s.leave} />
            <Stat label="Paid / Unpaid Leave" value={`${round2(s.paidLeave)} / ${round2(s.unpaidLeave)}`} />
            <Stat label="Holidays" value={s.holiday} />
            <Stat label="Week Offs" value={s.weekoff} />
          </div>
          {s.lopDates.length > 0 && (
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">LOP dates:</span> {s.lopDates.join(', ')}
              {s.sandwichLop > 0 && ` · Sandwich LOP: ${round2(s.sandwichLop)}`}
            </p>
          )}

          {p && (
            <Section title="Payroll">
              {!p.generated ? (
                <Empty text="Payroll is not generated for this month yet." />
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Paid Days" value={p.paidDays ?? '—'} />
                  <Stat label="Gross Earned" value={money(p.grossEarned)} />
                  <Stat label="Deductions" value={money(p.totalDeductions)} />
                  <Stat label="Net Pay" value={money(p.netPay)} tone="success" />
                  {!!p.bonusTotal && <Stat label="Bonuses" value={money(p.bonusTotal)} />}
                  {!!p.carryAdjustment && <Stat label="Arrears / Recovery" value={money(p.carryAdjustment)} />}
                  <Stat label="Payslip" value={p.payslipReleased ? 'Shared' : 'Not shared'} />
                </div>
              )}
            </Section>
          )}

          <Section title="Daily Attendance">
            <div className="max-h-80 overflow-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-page text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">In</th>
                    <th className="px-3 py-2 font-medium">Out</th>
                    <th className="px-3 py-2 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((d) => (
                    <tr key={d.date} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-1.5 text-ink">
                        {formatDisplayDate(d.date)}{' '}
                        <span className="text-ink-muted">
                          {new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        {d.status ? (
                          <span className={STATUS_CLASS[d.status]}>
                            {d.status === 'leave' && d.leaveTypeName ? d.leaveTypeName : STATUS_LABEL[d.status]}
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                        {d.status !== 'leave' && d.leaveTypeName && (
                          <span className="block text-[11px] text-ink-muted">
                            {d.leaveTypeName}
                            {d.leaveHalfDaySession ? ` (${HALF_LABEL[d.leaveHalfDaySession]})` : ''}
                          </span>
                        )}
                        {d.checkoutMissed && <span className="block text-[11px] text-warning">Missed checkout</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-ink">{d.checkIn ? formatDisplayTime(d.checkIn) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-ink">{d.checkOut ? formatDisplayTime(d.checkOut) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-ink">{workingHoursLabel(d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      <Section title="Leave Requests" count={report.leaveRequests.length}>
        {report.leaveRequests.length === 0 ? (
          <Empty text="No leave requests this month." />
        ) : (
          <ul className="space-y-1.5">
            {report.leaveRequests.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-ink">
                    {r.leaveTypeName}
                    {!r.isPaid && <span className="text-ink-muted"> (unpaid)</span>}
                    {r.halfDaySession && <span className="text-ink-muted"> · {HALF_LABEL[r.halfDaySession]}</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDisplayDateRange(r.fromDate, r.toDate)}
                    {r.days != null && ` · ${r.days} day${r.days === 1 ? '' : 's'}`}
                    {r.reason && ` · ${r.reason}`}
                  </p>
                  {r.rejectionReason && <p className="text-xs text-danger">{r.rejectionReason}</p>}
                </div>
                <Badge tone={requestTone(r.status)}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="OD Requests" count={report.odRequests.length}>
        {report.odRequests.length === 0 ? (
          <Empty text="No OD requests this month." />
        ) : (
          <ul className="space-y-1.5">
            {report.odRequests.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-ink">{r.purpose}</p>
                  <p className="text-xs text-ink-muted">
                    {formatDisplayDateRange(r.fromDate, r.toDate)}
                    {r.location && ` · ${r.location}`}
                  </p>
                  {r.rejectionReason && <p className="text-xs text-danger">{r.rejectionReason}</p>}
                </div>
                <Badge tone={requestTone(r.status)}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Regularizations" count={report.regularizations.length}>
        {report.regularizations.length === 0 ? (
          <Empty text="No regularization requests this month." />
        ) : (
          <ul className="space-y-1.5">
            {report.regularizations.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-ink">
                    {formatDisplayDate(r.date)} · {STATUS_LABEL[r.requestedStatus as ReportDayStatus] ?? r.requestedStatus}
                    {(r.requestedCheckIn || r.requestedCheckOut) && (
                      <span className="text-ink-muted">
                        {' '}
                        · {formatDisplayTime(r.requestedCheckIn)} → {formatDisplayTime(r.requestedCheckOut)}
                      </span>
                    )}
                  </p>
                  {r.reason && <p className="text-xs text-ink-muted">{r.reason}</p>}
                  {r.rejectionReason && <p className="text-xs text-danger">{r.rejectionReason}</p>}
                </div>
                <Badge tone={requestTone(r.status)}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Comp-Off Earned" count={report.compOffCredits.length}>
        {report.compOffCredits.length === 0 ? (
          <Empty text="No comp-off earned this month." />
        ) : (
          <ul className="space-y-1.5">
            {report.compOffCredits.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <p className="text-ink">
                  {formatDisplayDate(c.earnedDate)}
                  {c.expiryDate && <span className="text-xs text-ink-muted"> · expires {formatDisplayDate(c.expiryDate)}</span>}
                </p>
                <Badge tone={requestTone(c.status)}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Leave Balances">
        {report.leaveBalances.length === 0 ? (
          <Empty text="No leave balances." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-page text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Leave Type</th>
                  <th className="px-3 py-2 font-medium">Allotted</th>
                  <th className="px-3 py-2 font-medium">Used</th>
                  <th className="px-3 py-2 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {report.leaveBalances.map((b) => (
                  <tr key={b.leaveTypeName + b.periodStart} className="border-t border-border">
                    <td className="px-3 py-1.5 text-ink">{b.leaveTypeName}</td>
                    <td className="px-3 py-1.5 text-ink">
                      {b.allotted ?? 0}
                      {!!b.carriedForward && <span className="text-ink-muted"> (+{b.carriedForward} CF)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-ink">{b.used ?? 0}</td>
                    <td className="px-3 py-1.5 font-medium text-ink">{b.balance ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

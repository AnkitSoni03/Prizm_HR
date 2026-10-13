import { formatRupees, MONTH_NAMES, type EmployeePayroll } from '../../../api/payroll';
import { SalaryBreakdownView } from './SalaryBreakdownView';

// One month's payroll. With the full details (admin view, or an employee's
// released payslip) it shows the whole structure; otherwise only what an
// employee sees before requesting the payslip — deductions and in-hand.
export function PayrollMonthView({ payroll }: { payroll: EmployeePayroll }) {
  const d = payroll.details;
  const hasFull = !!d.earnings;
  const carries = d.carries ?? [];

  return (
    <div className="space-y-4">
      {payroll.revisedAt && (
        <p className="rounded-lg bg-primary-light px-3 py-2 text-sm text-primary">
          Revised on {new Date(payroll.revisedAt).toLocaleDateString('en-IN')} after a late change (leave / attendance / salary).
          Any difference from what was first paid is adjusted in the next salary.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Box label="Days in month" value={String(payroll.monthDays)} />
        <Box label="Paid days" value={String(payroll.paidDays)} />
        <Box label="Loss of pay days" value={String(payroll.lopDays)} warn={payroll.lopDays > 0} />
      </div>

      {hasFull ? (
        <SalaryBreakdownView
          breakdown={{
            earnings: d.earnings ?? [],
            deductions: d.deductions,
            employer: d.employer ?? [],
            pfSplit: d.pfSplit ?? null,
            wageRule: d.wageRule ?? { basic: 0, ctc: 0, percent: 0, compliant: true },
            warnings: d.warnings ?? [],
            full: d.full,
            actual: d.actual,
          }}
          monthlyCtc={Number(payroll.monthlyCtc ?? 0)}
          mode="month"
        />
      ) : (
        <div className="rounded-xl border border-border">
          <p className="rounded-t-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Deductions</p>
          <div className="divide-y divide-border text-sm">
            {d.deductions.length === 0 && <p className="px-3 py-2 text-ink-muted">No deductions</p>}
            {d.deductions.map((row) => (
              <div key={row.key} className="flex justify-between px-3 py-2 text-ink">
                <span>{row.name}</span>
                <span>{formatRupees(row.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 font-semibold text-ink">
              <span>Total deductions</span>
              <span>{formatRupees(payroll.totalDeductions)}</span>
            </div>
          </div>
        </div>
      )}

      {carries.length > 0 && (
        <div className="rounded-xl border border-border text-sm">
          <p className="rounded-t-xl bg-muted px-3 py-2 font-semibold text-ink">Adjustments from earlier months</p>
          {carries.map((c) => (
            <div key={c.id} className="flex justify-between border-t border-border px-3 py-2 text-ink">
              <span>
                {c.amount >= 0 ? 'Arrears' : 'Recovery'} for {MONTH_NAMES[c.sourceMonth - 1]} {c.sourceYear}
              </span>
              <span className={c.amount >= 0 ? 'text-success' : 'text-danger'}>
                {c.amount >= 0 ? '+' : '−'}
                {formatRupees(Math.abs(c.amount))}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success/10 px-4 py-3">
        <span className="text-sm font-semibold text-success">In-hand (credited)</span>
        <span className="text-xl font-bold text-success">{formatRupees(payroll.netPay)}</span>
      </div>

      {d.lopDates.length > 0 && (
        <details className="rounded-xl border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-ink">Loss of pay dates ({d.lopDates.length})</summary>
          <ul className="mt-2 space-y-1 text-ink-muted">
            {d.lopDates.map((l) => (
              <li key={l.date}>
                {new Date(`${l.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                {' — '}
                {l.reason ?? 'Unpaid'}
                {l.lop < 1 ? ` (${l.lop} day)` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Box({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-base font-semibold ${warn ? 'text-warning' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

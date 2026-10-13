import { formatRupees, type SalaryLine, type SalaryBreakdown } from '../../../api/payroll';

interface Props {
  breakdown: Pick<SalaryBreakdown, 'earnings' | 'deductions' | 'employer' | 'pfSplit' | 'wageRule' | 'warnings'> & {
    full?: SalaryBreakdown['full'];
    actual?: SalaryBreakdown['actual'];
  };
  monthlyCtc: number;
  // 'full' = the monthly salary structure (preview / CTC view); 'month' =
  // what was actually earned in one month (after loss-of-pay days).
  mode: 'full' | 'month';
}

function Section({
  title,
  rows,
  total,
  totalLabel,
  mode,
  tone,
}: {
  title: string;
  rows: SalaryLine[];
  total: number;
  totalLabel: string;
  mode: 'full' | 'month';
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border">
      <p className={`rounded-t-xl px-3 py-2 text-sm font-semibold ${tone}`}>{title}</p>
      <div className="divide-y divide-border">
        {rows.length === 0 && <p className="px-3 py-2 text-sm text-ink-muted">None</p>}
        {rows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="text-ink">{row.name}</p>
              {row.rule && <p className="text-xs text-ink-muted">{row.rule}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-medium text-ink">{formatRupees(mode === 'full' ? row.full ?? row.amount : row.amount)}</p>
              {mode === 'month' && row.full !== undefined && row.full !== row.amount && (
                <p className="text-xs text-ink-muted">of {formatRupees(row.full)}</p>
              )}
            </div>
          </div>
        ))}
        <div className="flex justify-between px-3 py-2 text-sm font-semibold text-ink">
          <span>{totalLabel}</span>
          <span>{formatRupees(total)}</span>
        </div>
      </div>
    </div>
  );
}

// CTC → gross → deductions → in-hand, the same breakdown as the reference
// salary sheet. Shared by the template/assign previews, the admin payroll
// detail and the employee's released payslip.
export function SalaryBreakdownView({ breakdown, monthlyCtc, mode }: Props) {
  const totals = mode === 'full' ? breakdown.full : breakdown.actual;
  const pf = breakdown.pfSplit ? (mode === 'full' ? breakdown.pfSplit.full : breakdown.pfSplit.actual) : null;
  const inHand = totals?.inHand ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="CTC / month" value={formatRupees(monthlyCtc)} />
        <Stat label="Gross salary" value={formatRupees(totals?.grossSalary)} />
        <Stat label="Deductions" value={formatRupees(totals?.totalDeductions)} />
        <Stat label="In-hand" value={formatRupees(inHand)} strong />
      </div>

      {breakdown.warnings?.map((w) => (
        <p key={w} className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{w}</p>
      ))}

      <div className="grid gap-3 md:grid-cols-2">
        <Section
          title="Earnings (gross salary)"
          rows={breakdown.earnings}
          total={totals?.grossSalary ?? 0}
          totalLabel="Total gross"
          mode={mode}
          tone="bg-primary-light text-primary"
        />
        <Section
          title="Employee deductions"
          rows={breakdown.deductions}
          total={totals?.totalDeductions ?? 0}
          totalLabel="Total deductions"
          mode={mode}
          tone="bg-danger/10 text-danger"
        />
        <Section
          title="Employer contributions (inside CTC, not paid as salary)"
          rows={breakdown.employer}
          total={totals?.totalEmployer ?? 0}
          totalLabel="Total employer share"
          mode={mode}
          tone="bg-warning/10 text-warning"
        />
        {pf && (
          <div className="rounded-xl border border-border">
            <p className="rounded-t-xl bg-muted px-3 py-2 text-sm font-semibold text-ink">PF account credit</p>
            <div className="divide-y divide-border text-sm">
              <Line label="Employee share → EPF" value={pf.employeeEpf} />
              <Line label="Employer share → EPF" value={pf.employerEpf} />
              <Line label={`Employer share → EPS pension (${breakdown.pfSplit?.epsRate}%)`} value={pf.eps} />
              <Line label="Total PF contribution" value={pf.employeeEpf + pf.employerEpf + pf.eps} strong />
            </div>
          </div>
        )}
      </div>

      {mode === 'full' && monthlyCtc > 0 && (
        <p className="text-sm text-ink-muted">
          In-hand is <span className="font-semibold text-ink">{Math.round((inHand / monthlyCtc) * 1000) / 10}%</span> of CTC ·
          Basic is {breakdown.wageRule.percent}% of CTC{' '}
          {breakdown.wageRule.compliant ? (
            <span className="text-success">(meets the 50% wage rule)</span>
          ) : (
            <span className="text-warning">(below the 50% wage rule of the Code on Wages)</span>
          )}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${strong ? 'border-success/30 bg-success/10' : 'border-border'}`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-base font-semibold ${strong ? 'text-success' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function Line({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between px-3 py-2 ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>
      <span>{label}</span>
      <span>{formatRupees(value)}</span>
    </div>
  );
}

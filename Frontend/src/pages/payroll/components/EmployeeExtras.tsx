import { Badge } from '../../../components/ui/Badge';
import { bonusTypeLabel, formatRupees, monthKeyLabel, periodLabel, type SalaryAssignment } from '../../../api/payroll';

const BASIS: Record<string, string> = { basic: 'Basic', gross: 'Gross', ctc: 'CTC' };
type Extras = NonNullable<SalaryAssignment['extras']>;
type Item = Extras['items'][number];
type Bonus = Extras['bonuses'][number];

const itemAmount = (i: Item) => (i.calcType === 'fixed' ? `${formatRupees(i.value)} / month` : `${i.value}% of ${BASIS[i.basis ?? 'gross']}`);
const itemWhen = (i: Item) => (i.months && i.months.length > 0 ? i.months.map(monthKeyLabel).join(', ') : 'Every month');
const bonusAmount = (b: Bonus) =>
  b.calcType === 'percent' ? `${Number(b.percent)}% of ${BASIS[b.basis ?? 'gross']}${b.amount ? ` (≈ ${formatRupees(b.amount)})` : ''}` : formatRupees(b.amount);
const KIND = {
  earning: { label: 'Allowance', sign: '+', tone: 'success' },
  deduction: { label: 'Deduction', sign: '−', tone: 'danger' },
  employer_contribution: { label: 'Employer contribution', sign: '', tone: 'warning' },
} as const;

const isEmpty = (extras?: Extras) => !extras || (extras.items.length === 0 && extras.bonuses.length === 0);

// Compact chips for a table cell: what the employee gets on top of the template.
export function ExtrasChips({ extras }: { extras?: Extras }) {
  if (isEmpty(extras)) return <span className="text-xs text-ink-muted">Template only</span>;
  return (
    <div className="flex max-w-xs flex-wrap gap-1">
      {extras!.items.map((i) => (
        <Badge key={`i${i.id}`} tone={KIND[i.kind].tone} title={KIND[i.kind].label}>
          {KIND[i.kind].sign} {i.name} {i.calcType === 'fixed' ? formatRupees(i.value) : `${i.value}% of ${BASIS[i.basis ?? 'gross']}`}
          {i.months && i.months.length > 0 ? ` (${i.months.map(monthKeyLabel).join(', ')})` : ''}
        </Badge>
      ))}
      {extras!.bonuses.map((b) => (
        <span
          key={`b${b.id}`}
          title="One-time bonus, paid on top of the salary"
          className="inline-flex items-center rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary"
        >
          {b.title || bonusTypeLabel(b.type)} {periodLabel(b.periodYear, b.periodMonth)}: {b.calcType === 'percent' ? `${Number(b.percent)}% of ${BASIS[b.basis ?? 'gross']}` : formatRupees(b.amount)}
        </span>
      ))}
    </div>
  );
}

// Full list for the salary popup.
export function ExtrasDetails({ extras }: { extras?: Extras }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-sm font-medium text-ink">Extras on top of the template</p>
      <p className="mb-2 text-xs text-ink-muted">Changed from the Allowances &amp; Deductions and Bonuses tabs.</p>
      {isEmpty(extras) ? (
        <p className="text-sm text-ink-muted">None — this employee is paid by the template only.</p>
      ) : (
        <div className="space-y-3">
          {extras!.items.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Allowances &amp; deductions</p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {extras!.items.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 font-medium text-ink">{i.name}</span>
                    <Badge tone={KIND[i.kind].tone}>{KIND[i.kind].label}</Badge>
                    <span className="w-40 text-ink">{itemAmount(i)}</span>
                    <span className="w-40 text-ink-muted">{itemWhen(i)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {extras!.bonuses.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Bonuses (this month on)</p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {extras!.bonuses.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 font-medium text-ink">{b.title || bonusTypeLabel(b.type)}</span>
                    <span className="text-xs text-ink-muted">{bonusTypeLabel(b.type)}</span>
                    <span className="w-40 text-ink">{bonusAmount(b)}</span>
                    <span className="w-40 text-ink-muted">{periodLabel(b.periodYear, b.periodMonth)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-ink-muted">
            Allowances sit inside CTC (taken out of Special). Deductions cut in-hand. Bonuses are paid on top, only in their month.
            The preview below shows the every-month items; month-limited items and bonuses are added in their months.
          </p>
        </div>
      )}
    </div>
  );
}

// Estimated in-hand for a regular month and for each coming month that has a
// month-limited item or a bonus (from the salary preview).
export function InHandByMonth({ regular, months }: { regular: number; months?: { month: string; extras: string[]; bonusTotal: number; totalDeductions: number; inHand: number }[] }) {
  if (!months || months.length === 0) return null;
  return (
    <div className="mb-3 rounded-xl border border-success/30 bg-card p-3">
      <p className="text-sm font-medium text-ink">Estimated in-hand by month</p>
      <p className="mb-2 text-xs text-ink-muted">Full month, no unpaid leave. The real payroll also counts attendance and the year&apos;s tax so far.</p>
      <div className="divide-y divide-border rounded-lg border border-border text-sm">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="min-w-0 flex-1 text-ink">Regular month</span>
          <span className="font-semibold text-ink">{formatRupees(regular)}</span>
        </div>
        {months.map((m) => {
          const diff = m.inHand - regular;
          return (
            <div key={m.month} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{monthKeyLabel(m.month)}</span>
                <span className="block text-xs text-ink-muted">{m.extras.join(', ')}</span>
              </span>
              {diff !== 0 && (
                <span className={`text-xs ${diff > 0 ? 'text-success' : 'text-danger'}`}>
                  {diff > 0 ? '+' : '−'}
                  {formatRupees(Math.abs(diff))}
                </span>
              )}
              <span className="w-28 text-right font-semibold text-success">{formatRupees(m.inHand)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

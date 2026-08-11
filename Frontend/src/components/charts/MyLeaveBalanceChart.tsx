import { Wallet } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';

export interface LeaveBalanceEntry {
  name: string;
  balance: number;
}

export interface LeaveUsageEntry {
  /** Short leave-type code, e.g. "SL", "CL" — falls back to the full name
   * when a type has no code. */
  code: string;
  used: number;
}

// Own-scoped sibling of company-admin's LeaveDonutChart (which plots days
// *taken*, company-wide) — this one plots the caller's own remaining
// *balance* per leave type, so it deliberately doesn't share that component
// despite the near-identical shape.
function foldToTop(data: LeaveBalanceEntry[], max: number): LeaveBalanceEntry[] {
  if (data.length <= max) return data;
  const top = data.slice(0, max - 1);
  const rest = data.slice(max - 1);
  const otherBalance = Math.round(rest.reduce((sum, d) => sum + d.balance, 0) * 10) / 10;
  return [...top, { name: 'Other', balance: otherBalance }];
}

export function MyLeaveBalanceChart({ data, usage = [] }: { data: LeaveBalanceEntry[]; usage?: LeaveUsageEntry[] }) {
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const folded = foldToTop(data.filter((d) => d.balance > 0), 4);
  const total = Math.round(folded.reduce((sum, d) => sum + d.balance, 0) * 10) / 10;

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
          <Wallet className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div>
          <h3 className="text-base font-semibold text-ink">Leave Balance</h3>
          <p className="text-xs text-ink-muted">Remaining days available, by leave type</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">No leave balance available</div>
      ) : (
        <div className="flex flex-1 items-center gap-4">
          <div className="relative flex h-[150px] w-[150px] shrink-0 items-center justify-center sm:h-[170px] sm:w-[170px]">
            <div
              className="pointer-events-none absolute inset-4 rounded-full opacity-40 blur-2xl"
              style={{ backgroundColor: palette.accentSoft }}
            />
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={folded}
                  dataKey="balance"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={72}
                  paddingAngle={2}
                  cornerRadius={3}
                  strokeWidth={0}
                >
                  {folded.map((entry, i) => (
                    <Cell key={entry.name} fill={palette.categorical[i % palette.categorical.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tracking-tight text-ink">{total}</span>
              <span className="text-[10px] font-medium text-ink-muted">Days Left</span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-1">
            {folded.map((entry, i) => {
              const pct = total > 0 ? Math.round((entry.balance / total) * 100) : 0;
              return (
                <li key={entry.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 text-ink-muted">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: palette.categorical[i % palette.categorical.length] }}
                    />
                    <span className="truncate">{entry.name}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-ink">
                    {entry.balance} <span className="font-normal text-ink-muted">({pct}%)</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {usage.length > 0 && (
        <div className="mt-4 border-t border-border pt-3.5">
          <p className="mb-2 text-xs font-medium text-ink-muted">Used this year</p>
          <div className="flex flex-wrap gap-1.5">
            {usage.map((u) => (
              <span
                key={u.code}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-page px-2.5 py-1 text-[11px] text-ink"
              >
                <span className="font-semibold uppercase tracking-wide text-ink-muted">{u.code}</span>
                <span className={u.used > 0 ? 'font-semibold text-primary' : 'text-ink-muted'}>{u.used}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

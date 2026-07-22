import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';

export interface LeaveBalanceEntry {
  name: string;
  balance: number;
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

export function MyLeaveBalanceChart({ data }: { data: LeaveBalanceEntry[] }) {
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const folded = foldToTop(data.filter((d) => d.balance > 0), 4);
  const total = Math.round(folded.reduce((sum, d) => sum + d.balance, 0) * 10) / 10;

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs">
      <h3 className="mb-1 text-base font-semibold text-ink">Leave Balance</h3>
      <p className="mb-4 text-xs text-ink-muted">Remaining days available, by leave type</p>

      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">No leave balance available</div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4">
          <div className="relative h-[180px] w-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={folded}
                  dataKey="balance"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {folded.map((entry, i) => (
                    <Cell key={entry.name} fill={palette.categorical[i % palette.categorical.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold text-ink">{total}</span>
              <span className="text-[11px] text-ink-muted">Days Left</span>
            </div>
          </div>

          <ul className="w-full space-y-2">
            {folded.map((entry, i) => {
              const pct = total > 0 ? Math.round((entry.balance / total) * 100) : 0;
              return (
                <li key={entry.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-ink-muted">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: palette.categorical[i % palette.categorical.length] }}
                    />
                    {entry.name}
                  </span>
                  <span className="font-medium text-ink">
                    {entry.balance} <span className="text-ink-muted">({pct}%)</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

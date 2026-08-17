import type { PlatformDashboardSummary } from '../../../api/tenancy';
import { useTheme } from '../../../context/theme-context';
import { getChartPalette } from '../../../utils/chartColors';

// Same 3-tone grouping CompanyCard.tsx/CompaniesPage.tsx already use for the
// status Badge (active=success, trial/grace=warning, suspended/terminated=
// danger) — status colors are reserved and never doubled as identity, so two
// rows legitimately sharing a color (trial & grace, suspended & terminated)
// is expected here; each row still carries its own text label and count, so
// nothing depends on color alone to tell them apart.
const ROWS: { key: keyof PlatformDashboardSummary['companyStatusBreakdown']; label: string; tone: 'success' | 'warning' | 'danger' }[] = [
  { key: 'active', label: 'Active', tone: 'success' },
  { key: 'trial', label: 'Trial', tone: 'warning' },
  { key: 'grace', label: 'Grace Period', tone: 'warning' },
  { key: 'suspended', label: 'Suspended', tone: 'danger' },
  { key: 'terminated', label: 'Terminated', tone: 'danger' },
];

export function CompanyStatusBreakdown({ breakdown }: { breakdown: PlatformDashboardSummary['companyStatusBreakdown'] }) {
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const total = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
  const max = Math.max(1, ...Object.values(breakdown));

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs">
      <h3 className="mb-1 text-base font-semibold text-ink">Company Status</h3>
      <p className="mb-4 text-xs text-ink-muted">{total} compan{total === 1 ? 'y' : 'ies'} across every Group</p>

      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">No companies yet</div>
      ) : (
        <ul className="flex-1 space-y-3">
          {ROWS.map((row) => {
            const count = breakdown[row.key];
            const pct = Math.round((count / max) * 100);
            return (
              <li key={row.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: palette.status[row.tone] }} />
                    {row.label}
                  </span>
                  <span className="font-medium text-ink">{count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-page">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: palette.status[row.tone] }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

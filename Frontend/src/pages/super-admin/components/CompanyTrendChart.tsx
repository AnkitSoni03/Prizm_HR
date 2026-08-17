import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PlatformCompanyTrendPoint } from '../../../api/tenancy';
import { useTheme } from '../../../context/theme-context';
import { getChartPalette } from '../../../utils/chartColors';

interface TooltipPayloadItem {
  value: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-ink">{label}</p>
      <p className="text-ink-muted">
        Companies onboarded: <span className="font-medium text-ink">{payload[0].value}</span>
      </p>
    </div>
  );
}

// Single series — no legend box needed (the title names it), per the
// dataviz palette rules this app's charts already follow.
export function CompanyTrendChart({ data }: { data: PlatformCompanyTrendPoint[] }) {
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const hasActivity = data.some((d) => d.joined > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-ink">Companies Onboarded</h3>
        <p className="text-xs text-ink-muted">New companies, last 6 months</p>
      </div>

      {!hasActivity ? (
        <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
          No companies onboarded in the last 6 months
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="companyTrendJoined" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: palette.mutedText, fontSize: 12 }}
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(4, max + 1)]}
              tick={{ fill: palette.mutedText, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: palette.grid }} />
            <Area
              type="monotone"
              dataKey="joined"
              name="Companies"
              stroke={palette.accent}
              strokeWidth={2}
              fill="url(#companyTrendJoined)"
              dot={{ r: 3, fill: palette.accent, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

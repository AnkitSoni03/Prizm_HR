import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EmployeeTrendPoint } from '../../api/companyAdmin/dashboard';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';

interface TooltipPayloadItem {
  color: string;
  name: string;
  value: number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center gap-1.5 text-ink-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span>
            {item.name}: <span className="font-medium text-ink">{item.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmployeeTrendChart({ data }: { data: EmployeeTrendPoint[] }) {
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const hasActivity = data.some((d) => d.joined > 0 || d.exited > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">Employee Overview</h3>
          <p className="text-xs text-ink-muted">Joined vs. exited, last 6 months</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.accent }} />
            Joined
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.mutedText }} />
            Exited
          </span>
        </div>
      </div>

      {!hasActivity ? (
        <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
          No joiners or exits in the last 6 months
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="employeeTrendJoined" x1="0" y1="0" x2="0" y2="1">
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
              name="Joined"
              stroke={palette.accent}
              strokeWidth={2}
              fill="url(#employeeTrendJoined)"
              dot={{ r: 3, fill: palette.accent, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="exited"
              name="Exited"
              stroke={palette.mutedText}
              strokeWidth={2}
              fill="transparent"
              dot={{ r: 3, fill: palette.mutedText, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

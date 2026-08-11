import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Attendance } from '../../api/ess/attendance';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  on_duty: 'On Duty',
  half_day: 'Half Day',
  leave: 'On Leave',
  holiday: 'Holiday',
  weekoff: 'Week Off',
  absent: 'Absent',
  future: 'Upcoming',
};

interface Point {
  day: number;
  date: string;
  hours: number;
  status: string;
  color: string;
}

function workedHours(record: Attendance): number {
  if (!record.checkIn || !record.checkOut) return 0;
  const minutes = (new Date(record.checkOut).getTime() - new Date(record.checkIn).getTime()) / 60000;
  return minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : 0;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

interface TooltipPayloadItem {
  payload: Point;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-ink">{point.date}</p>
      <div className="flex items-center gap-1.5 text-ink-muted">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: point.color }} />
        {STATUS_LABEL[point.status] ?? point.status}
        {point.hours > 0 && <span className="font-medium text-ink">· {point.hours}h</span>}
      </div>
    </div>
  );
}

interface AttendanceHoursChartProps {
  /** Full calendar year, e.g. 2026. */
  year: number;
  /** 0-indexed month (0 = January), matching JS Date convention. */
  month: number;
  /** Rows for whatever range was actually fetched (backend clips at today) —
   * days beyond the last row here render as empty "upcoming" placeholders so
   * the chart always spans the whole month, not just the days so far. */
  rows: Attendance[];
}

export function AttendanceHoursChart({ year, month, rows }: AttendanceHoursChartProps) {
  const { theme } = useTheme();
  const palette = getChartPalette(theme);

  const colorForStatus = (status: string): string => {
    if (status === 'present' || status === 'on_duty') return palette.status.success;
    if (status === 'half_day') return palette.status.warning;
    if (status === 'leave') return palette.status.info;
    if (status === 'absent') return palette.status.danger;
    return palette.grid;
  };

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const data: Point[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${pad(month + 1)}-${pad(day)}`;
    const record = byDate.get(date);
    data.push({
      day,
      date,
      hours: record ? workedHours(record) : 0,
      status: record ? record.status : 'future',
      color: record ? colorForStatus(record.status) : palette.grid,
    });
  }

  const hasHours = data.some((d) => d.hours > 0);
  // Explicit integer ticks — Recharts' auto tick generator produces
  // repeated/garbled labels (e.g. every tick showing "1") when the data max
  // is a small fraction of an hour, since allowDecimals={false} then rounds
  // several distinct auto-computed ticks down to the same integer.
  const maxHours = Math.max(1, ...data.map((d) => Math.ceil(d.hours)));
  const tickStep = maxHours > 12 ? 2 : 1;
  const yTicks = Array.from({ length: Math.floor(maxHours / tickStep) + 1 }, (_, i) => i * tickStep);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-md">
      <h3 className="mb-1 text-base font-semibold text-ink">Working Hours</h3>
      <p className="mb-4 text-xs text-ink-muted">Hours logged per day this month</p>

      {!hasHours ? (
        <div className="flex h-56 items-center justify-center text-sm text-ink-muted">No working hours logged yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="15%">
            <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: palette.mutedText, fontSize: 11 }}
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
              interval={daysInMonth > 20 ? 1 : 0}
            />
            <YAxis
              domain={[0, maxHours]}
              ticks={yTicks}
              allowDecimals={false}
              tick={{ fill: palette.mutedText, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={30}
              unit="h"
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: palette.grid, opacity: 0.4 }} />
            <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={18}>
              {data.map((point) => (
                <Cell key={point.date} fill={point.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.status.success }} />
          Present
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.status.warning }} />
          Half Day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.status.info }} />
          Leave
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.status.danger }} />
          Absent
        </span>
      </div>
    </div>
  );
}

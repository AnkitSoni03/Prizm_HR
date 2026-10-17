import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Attendance } from '../../api/ess/attendance';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';
import { formatDisplayDate } from '../../utils/dateDisplay';

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
  // Paid day off (week off / holiday / paid leave) shown at shift length —
  // drawn lighter, since no hours were actually worked.
  credited: boolean;
  // e.g. "Short Leave" or "Casual Leave (First half)" — null when no leave covers the day.
  leaveLabel: string | null;
}

const HALF_LABEL: Record<string, string> = { first_half: 'First half', second_half: 'Second half' };

function leaveLabelFor(record: Attendance): string | null {
  if (!record.leaveTypeName) return record.status === 'leave' ? 'Leave' : null;
  const half = record.leaveHalfDaySession ? HALF_LABEL[record.leaveHalfDaySession] : null;
  return half ? `${record.leaveTypeName} (${half})` : record.leaveTypeName;
}

const toHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

// Hours for one day. Worked days use the backend's workedMinutes (actual
// punches, or the shift's length for an On Duty / missed-checkout day). A
// week off, holiday or paid leave with nothing worked shows the shift's
// length (half for a paid half-day leave); unpaid leave and absent show 0.
function dayHours(record: Attendance): { hours: number; credited: boolean } {
  const worked = record.workedMinutes ?? 0;
  if (worked > 0) return { hours: toHours(worked), credited: false };
  const shift = record.shiftMinutes ?? 0;
  if (record.status === 'weekoff' || record.status === 'holiday') return { hours: toHours(shift), credited: true };
  if (record.status === 'leave') {
    const share = record.paidLeaveShare ?? 0;
    return { hours: toHours(shift * share), credited: share > 0 };
  }
  return { hours: 0, credited: false };
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
      <p className="mb-1 font-medium text-ink">{formatDisplayDate(point.date)}</p>
      <div className="flex items-center gap-1.5 text-ink-muted">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: point.color }} />
        {point.status === 'leave' && point.leaveLabel ? point.leaveLabel : STATUS_LABEL[point.status] ?? point.status}
        {point.hours > 0 && <span className="font-medium text-ink">· {point.hours}h</span>}
      </div>
      {point.status !== 'leave' && point.leaveLabel && (
        <p className="mt-0.5 text-[11px] text-ink-muted">Leave: {point.leaveLabel}</p>
      )}
      {point.credited && <p className="mt-0.5 text-[11px] text-ink-muted">Paid day off · shift hours</p>}
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
    if (status === 'holiday') return palette.categorical[3];
    if (status === 'weekoff') return palette.status.neutral;
    return palette.grid;
  };

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const data: Point[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${pad(month + 1)}-${pad(day)}`;
    const record = byDate.get(date);
    const { hours, credited } = record ? dayHours(record) : { hours: 0, credited: false };
    data.push({
      day,
      date,
      hours,
      status: record ? record.status : 'future',
      color: record ? colorForStatus(record.status) : palette.grid,
      credited,
      leaveLabel: record ? leaveLabelFor(record) : null,
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
      <p className="mb-4 text-xs text-ink-muted">
        Hours per day this month · lighter bars are paid days off, shown at your shift length
      </p>

      {!hasHours ? (
        <div className="flex h-56 items-center justify-center text-sm text-ink-muted">No working hours logged yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="15%">
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
              width={36}
              tickFormatter={(value: number) => `${value}h`}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: palette.grid, opacity: 0.4 }} />
            <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={18}>
              {data.map((point) => (
                <Cell key={point.date} fill={point.color} fillOpacity={point.credited ? 0.45 : 1} />
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
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.status.neutral }} />
          Week Off
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.categorical[3] }} />
          Holiday
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.status.danger }} />
          Absent
        </span>
      </div>
    </div>
  );
}

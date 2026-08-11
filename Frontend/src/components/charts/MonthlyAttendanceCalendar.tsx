import { CalendarRange } from 'lucide-react';
import type { Attendance } from '../../api/ess/attendance';

interface MonthlyAttendanceCalendarProps {
  /** Full calendar year, e.g. 2026. */
  year: number;
  /** 0-indexed month (0 = January), matching JS Date convention. */
  month: number;
  /** Gap-filled rows for [month start, today] — every calendar day already
   * carries a status ('holiday'/'weekoff' included) via the backend's
   * listMyAttendanceHistory synthesis, so no client-side shift/holiday
   * math is needed here. */
  rows: Attendance[];
  /** Today as YYYY-MM-DD (local) — days after this render as "upcoming". */
  today: string;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const CELL_STYLE: Record<string, string> = {
  present: 'bg-success/15 text-success border-success/30 font-semibold',
  on_duty: 'bg-success/15 text-success border-success/30 font-semibold',
  half_day: 'bg-warning/15 text-warning border-warning/30 font-semibold',
  leave: 'bg-primary/10 text-primary border-primary/25 font-semibold',
  absent: 'bg-danger/15 text-danger border-danger/30 font-semibold',
  excluded: 'bg-muted text-ink-muted/70 border-transparent',
  future: 'border-dashed border-border text-ink-muted/40',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function MonthlyAttendanceCalendar({ year, month, rows, today }: MonthlyAttendanceCalendarProps) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const statusByDate = new Map(rows.map((r) => [r.date, r.status]));

  let present = 0;
  let halfDay = 0;
  let leave = 0;
  let absent = 0;
  for (const r of rows) {
    if (r.status === 'present' || r.status === 'on_duty') present++;
    else if (r.status === 'half_day') halfDay++;
    else if (r.status === 'leave') leave++;
    else if (r.status === 'absent') absent++;
    // holiday/weekoff intentionally uncounted — excluded from the
    // working-days denominator by construction.
  }
  // Denominator deliberately counts leave alongside present/half-day/absent
  // — only holidays and weekly-offs (resolved server-side from the
  // employee's actual shift/roster) are excluded, per the ask.
  const workingDays = present + halfDay + leave + absent;

  const legend: { label: string; swatch: string; count: number }[] = [
    { label: 'Present', swatch: 'bg-success', count: present },
    { label: 'Half Day', swatch: 'bg-warning', count: halfDay },
    { label: 'Leave', swatch: 'bg-primary', count: leave },
    { label: 'Absent', swatch: 'bg-danger', count: absent },
  ];

  const cells: { day: number; className: string; title: string }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${pad(month + 1)}-${pad(day)}`;
    let className: string;
    let title: string;
    if (date > today) {
      className = CELL_STYLE.future;
      title = 'Upcoming';
    } else {
      const status = statusByDate.get(date);
      if (status === 'holiday' || status === 'weekoff') {
        className = CELL_STYLE.excluded;
        title = status === 'holiday' ? 'Holiday' : 'Week Off';
      } else if (status && CELL_STYLE[status]) {
        className = CELL_STYLE[status];
        title = status.replace('_', ' ');
      } else {
        className = CELL_STYLE.future;
        title = 'No data';
      }
    }
    cells.push({ day, className, title: `${date} · ${title}` });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
          <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-ink">Monthly Attendance</h3>
          <p className="text-[11px] text-ink-muted">{monthLabel} · holidays &amp; week-offs excluded</p>
        </div>
      </div>

      <div className="mb-3 border-b border-border pb-3">
        <p className="text-2xl font-bold leading-tight text-ink">
          {present}
          <span className="text-sm font-medium text-ink-muted">/{workingDays}</span>{' '}
          <span className="text-xs font-normal text-ink-muted">days present</span>
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={`${w}-${i}`} className="text-center text-xs font-medium text-ink-muted">
            {w}
          </div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {cells.map((cell) => (
          <div key={cell.day} className="flex items-center justify-center">
            <div
              title={cell.title}
              className={`flex h-10 w-10 items-center justify-center rounded-md border text-sm transition-colors sm:h-11 sm:w-11 sm:text-base ${cell.className}`}
            >
              {cell.day}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5">
        {legend.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className={`h-2 w-2 shrink-0 rounded-full ${item.swatch}`} />
            {item.label} <span className="font-semibold text-ink">{item.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, LayoutGrid, Search } from 'lucide-react';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  getAttendanceBoard,
  getAttendanceBoardXlsx,
  type AttendanceBoardDay,
  type AttendanceBoardRow,
  type AttendanceRosterStatus,
} from '../../api/companyAdmin/attendanceRecords';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_OPTIONS = MONTH_LABELS.map((label, i) => ({ value: String(i + 1), label }));

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => ({
  value: String(y),
  label: String(y),
}));

// Cell background/text per underlying status category — same success/
// warning/primary/danger token convention as MonthlyAttendanceCalendar.tsx
// and AttendanceRecordsPage.tsx's STATUS_TONE, so a "present" cell here
// reads the same way it does everywhere else in the app.
const CATEGORY_STYLE: Record<AttendanceRosterStatus, string> = {
  present: 'bg-success/15 text-success',
  on_duty: 'bg-success/15 text-success',
  half_day: 'bg-warning/15 text-warning',
  leave: 'bg-primary/10 text-primary',
  absent: 'bg-danger/15 text-danger',
  holiday: 'bg-ink-muted/10 text-ink-muted',
  weekoff: 'bg-page text-ink-muted',
  not_marked: 'text-ink-muted',
};

const LEGEND: { code: string; label: string; category: AttendanceRosterStatus }[] = [
  { code: 'P', label: 'Present', category: 'present' },
  { code: 'A', label: 'Absent', category: 'absent' },
  { code: 'HD', label: 'Half Day', category: 'half_day' },
  { code: 'AL', label: 'Annual Leave', category: 'leave' },
  { code: 'SHL', label: 'Short Leave', category: 'leave' },
  { code: 'SPL', label: 'Special Leave', category: 'leave' },
  { code: 'UPHD', label: 'Unpaid Half Day', category: 'leave' },
  { code: 'UL', label: 'Unpaid Leave', category: 'leave' },
  { code: 'MTL', label: 'Maternity Leave', category: 'leave' },
  { code: 'PTL', label: 'Paternity Leave', category: 'leave' },
  { code: 'OD', label: 'On Duty', category: 'on_duty' },
  { code: 'H', label: 'Holiday', category: 'holiday' },
  { code: 'W', label: 'Weekend / Week Off', category: 'weekoff' },
];

function cellClassName(day: AttendanceBoardDay): string {
  if (!day.category) return 'text-ink-muted/30';
  return CATEGORY_STYLE[day.category] ?? 'text-ink-muted';
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Company Admin/Brand Admin "Attendance Board" — every active employee (row)
// x every day of one calendar month (column) on a single page, each cell a
// compact status code. Reuses the same server-side gap-fill synthesis the
// ESS "My Attendance" calendar already relies on (GET /attendance/board),
// just batched across the whole company/brand instead of one employee.
export function AttendanceBoardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState<AttendanceBoardRow[]>([]);
  const [daysInMonth, setDaysInMonth] = useState(31);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);
    getAttendanceBoard(year, month)
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setDaysInMonth(result.daysInMonth);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the attendance board.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => (r.name ?? '').toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q)
    );
  }, [rows, search]);

  async function handleExport() {
    setIsExporting(true);
    setError(null);
    try {
      const blob = await getAttendanceBoardXlsx(year, month);
      downloadBlob(`attendance-board-${year}-${String(month).padStart(2, '0')}.xlsx`, blob);
    } catch {
      setError('Could not export the attendance board.');
    } finally {
      setIsExporting(false);
    }
  }

  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            className="rounded-xl border border-border bg-card p-2 text-ink-muted transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <div className="w-36">
            <Select
              id="attendance-board-month"
              label="Month"
              value={String(month)}
              onChange={(event) => setMonth(Number(event.target.value))}
              options={MONTH_OPTIONS}
            />
          </div>
          <div className="w-28">
            <Select
              id="attendance-board-year"
              label="Year"
              value={String(year)}
              onChange={(event) => setYear(Number(event.target.value))}
              options={YEAR_OPTIONS}
            />
          </div>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
            className="rounded-xl border border-border bg-card p-2 text-ink-muted transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" strokeWidth={1.75} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee"
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={rows.length === 0}
            isLoading={isExporting}
          >
            <Download className="h-4 w-4" strokeWidth={1.75} />
            Export
          </Button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-xs">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Status Codes</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGEND.map((item) => (
            <span key={item.code} className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-bold ${CATEGORY_STYLE[item.category]}`}
              >
                {item.code}
              </span>
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && filteredRows.length === 0 && (
        <EmptyStateCard
          icon={LayoutGrid}
          title="No employees found"
          description={search ? 'Try a different search term.' : 'No active employees to show.'}
        />
      )}

      {isLoading && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <Skeleton className="h-4 w-1/3" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      )}

      {!isLoading && filteredRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border bg-page">
              <tr>
                <th className="sticky left-0 z-10 whitespace-nowrap bg-page px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Name
                </th>
                {dayNumbers.map((d) => (
                  <th
                    key={d}
                    className="min-w-9 px-1 py-2.5 text-center text-xs font-semibold text-ink-muted"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => (
                <tr key={row.employeeId}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-4 py-2 align-middle">
                    <div className="font-medium text-ink">{row.name ?? '—'}</div>
                    <div className="text-xs text-ink-muted">({row.employeeCode})</div>
                  </td>
                  {row.days.map((day) => (
                    <td key={day.day} className="p-0 text-center align-middle">
                      <div
                        className={`flex h-8 w-full items-center justify-center text-[11px] font-semibold ${cellClassName(day)}`}
                      >
                        {day.code ?? ''}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  IdCard,
  LogIn,
  LogOut,
  Megaphone,
  PartyPopper,
  RefreshCw,
  Send,
  ShieldCheck,
  Timer,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';
import { listMyAttendance, listMyRegularizations, type Attendance } from '../../api/ess/attendance';
import { listHolidays, listMyLeaveBalances, listMyLeaveRequests, type Holiday } from '../../api/ess/leave';
import { listMyOdRequests } from '../../api/ess/od';
import { getMyProfile, getMyManagers, type EmployeeProfile, type MyManager } from '../../api/ess/profile';
import { listPowers, type Power } from '../../api/powers';
import { listCompanyPolicies, type CompanyPolicy } from '../../api/companyAdmin/companyPolicies';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { HeroStatTile } from '../../components/ui/HeroStatTile';
import { StatTileSkeleton } from '../../components/ui/StatTile';
import { Skeleton } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { DashboardHeader } from '../../components/DashboardHeader';
import { QuickActions, type QuickAction } from '../../components/QuickActions';
import { MyLeaveBalanceChart, type LeaveBalanceEntry, type LeaveUsageEntry } from '../../components/charts/MyLeaveBalanceChart';
import { MonthlyAttendanceCalendar } from '../../components/charts/MonthlyAttendanceCalendar';
import { formatDisplayDate } from '../../utils/dateDisplay';

const NOW = new Date();

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthStartStr(): string {
  const y = NOW.getFullYear();
  const m = String(NOW.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function addDaysStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Local Y-M-D → Date at local midnight, never `new Date(str)` directly —
// see CLAUDE.md's date-range gotcha (toISOString rolls a date back a day
// on any server ahead of UTC).
function daysUntil(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half Day',
  leave: 'On Leave',
  holiday: 'Holiday',
  weekoff: 'Week Off',
  on_duty: 'On Duty',
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  present: 'success',
  on_duty: 'success',
  half_day: 'warning',
  absent: 'danger',
  leave: 'neutral',
  holiday: 'neutral',
  weekoff: 'neutral',
};

const TONE_CLASSES: Record<'success' | 'warning' | 'danger' | 'neutral', string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-muted text-ink-muted',
};

// Same shape as MyAttendancePage's workedMinutes/formatDuration — only
// meaningful once both punches exist for today.
function workingHoursLabel(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return '—';
  const minutes = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000;
  if (minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

// "Ankit Soni" -> "AS" — same two-initial fallback shape as every other
// avatar-with-photo pattern in this app (Avatar.tsx falls back to a plain
// person icon instead; this card wants the initials specifically, to match
// the requested ID-card design), capped at 2 characters even for a
// multi-word name.
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + second).toUpperCase();
}

const EMPLOYEE_STATUS_LABEL: Record<EmployeeProfile['status'], string> = {
  onboarding: 'Onboarding',
  active: 'Active',
  on_notice: 'On Notice',
  exited: 'Exited',
  archived: 'Archived',
};

// Icons only — accentColor is filled in at render time from the current
// theme's chart palette (QUICK_ACTIONS itself can't call useTheme, it's a
// module-level const), cycling the same 4 validated hues HeroStatTile uses.
const QUICK_ACTIONS_BASE: QuickAction[] = [
  { label: 'Apply Leave', to: '/ess/leave', icon: CalendarClock },
  { label: 'Apply OD', to: '/ess/od', icon: Send },
  { label: 'My Comp-Off', to: '/ess/comp-off', icon: RefreshCw },
  { label: 'My Payslips', to: '/ess/payslips', icon: Wallet },
  { label: 'Raise Regularization', to: '/ess/attendance?tab=requests', icon: CalendarCheck },
  { label: 'Team Approvals', to: '/ess/team-approvals', icon: Users },
  { label: 'Company Policies', to: '/ess/policies', icon: FileText },
  { label: 'View Calendar', to: '/ess/attendance', icon: CalendarRange },
];

interface Summary {
  todayStatus: string | null;
  checkIn: string | null;
  checkOut: string | null;
  leaveBalanceTotal: number;
  leaveBreakdown: LeaveBalanceEntry[];
  leaveUsage: LeaveUsageEntry[];
  leaveUsedTotal: number;
  pendingRequests: number;
  monthAttendance: Attendance[];
  monthPresent: number;
  monthWorkingDays: number;
}

// Full-page loading skeleton, shaped to mirror every section of the actual
// loaded dashboard below (mobile ID card / desktop banner, 4 stat tiles, the
// attendance/calendar/leave-chart row, quick actions + notices row) at the
// same breakpoints — a generic 4-tile skeleton used to flash a much shorter
// page than what actually renders, causing a layout jump the instant data
// arrived.
function MobileIdCardSkeleton() {
  return (
    <div className="mb-3 block sm:hidden">
      <div className="rounded-3xl border border-border bg-muted p-4 shadow-md">
        <div className="flex items-start gap-3">
          <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <Skeleton className="mt-4 h-14 w-full rounded-2xl" />
      </div>
      <Skeleton className="mt-3 h-[92px] w-full rounded-2xl" />
    </div>
  );
}

function DesktopHeaderSkeleton() {
  return (
    <div className="hidden sm:block">
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-md">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
            </div>
          </div>
          <Skeleton className="h-20 w-56 shrink-0 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function AttendanceCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-lg sm:h-8 sm:w-8" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 sm:gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[42px] w-full rounded-lg sm:h-[46px]" />
        ))}
      </div>
      <Skeleton className="mt-4 h-9 w-full rounded-lg" />
    </div>
  );
}

function CalendarCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="mb-3 border-b border-border pb-3">
        <Skeleton className="h-7 w-24" />
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="mx-auto h-3 w-4" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="mx-auto h-10 w-10 rounded-md sm:h-11 sm:w-11" />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
    </div>
  );
}

function LeaveChartCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      <div className="flex flex-1 items-center gap-4">
        <Skeleton className="h-[150px] w-[150px] shrink-0 rounded-full sm:h-[170px] sm:w-[170px]" />
        <div className="min-w-0 flex-1 space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickActionsSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
      <Skeleton className="mb-3 h-4 w-28 sm:mb-4" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-lg sm:h-[84px]" />
        ))}
      </div>
    </div>
  );
}

function NoticesCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-lg sm:h-8 sm:w-8" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="flex-1 space-y-2 sm:space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function EssDashboardSkeleton() {
  return (
    <div>
      <MobileIdCardSkeleton />
      <DesktopHeaderSkeleton />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AttendanceCardSkeleton />
        <CalendarCardSkeleton />
        <LeaveChartCardSkeleton />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <QuickActionsSkeleton />
        </div>
        <NoticesCardSkeleton />
      </div>
    </div>
  );
}

// No backend dashboard-summary endpoint covers Employees (/dashboard/summary
// is company:read only) — this composes the tiles client-side from the
// same *_own-scoped list endpoints the other ESS pages use.
export function EssDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [employeeCode, setEmployeeCode] = useState<string | null>(null);
  const [dateOfJoining, setDateOfJoining] = useState<string | null>(null);
  const [designation, setDesignation] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [employeeStatus, setEmployeeStatus] = useState<EmployeeProfile['status'] | null>(null);
  const [upcomingHolidays, setUpcomingHolidays] = useState<Holiday[]>([]);
  const [latestPolicy, setLatestPolicy] = useState<CompanyPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myPowers, setMyPowers] = useState<Power[]>([]);
  const [myManagers, setMyManagers] = useState<MyManager[]>([]);

  const quickActions: QuickAction[] = QUICK_ACTIONS_BASE.map((action, i) => ({
    ...action,
    accentColor: palette.categorical[i % palette.categorical.length],
  }));

  // Only ever lists a power when *every* one of its constituent permission
  // codes is present — matches how assignEmployeePowers grants them as an
  // all-or-nothing bundle (see powerCatalog.js).
  useEffect(() => {
    if (!user) return;
    listPowers()
      .then((catalog) =>
        setMyPowers(catalog.filter((power) => power.permissionCodes.every((code) => user.permissions.includes(code))))
      )
      .catch(() => {
        /* non-critical — the dashboard still works without this section */
      });
  }, [user]);

  // Full manager set (primary + additional) — see
  // employee.controller.js::getMyManagers. Independent of getMyProfile below
  // (which only ever resolves the single primary manager field).
  useEffect(() => {
    if (!user?.employeeId) return;
    getMyManagers()
      .then(setMyManagers)
      .catch(() => {
        /* non-critical — the dashboard still works without this section */
      });
  }, [user?.employeeId]);

  useEffect(() => {
    if (!user?.employeeId) return;
    getMyProfile(user.employeeId)
      .then((profile) => {
        setDisplayName(profile.name);
        setEmployeeCode(profile.employeeCode);
        setDateOfJoining(profile.dateOfJoining);
        setEmployeeStatus(profile.status);
        setDesignation(profile.designation?.title ?? null);
        setDepartment(profile.department?.name ?? null);
      })
      .catch(() => {
        /* non-critical — falls back to email in the greeting */
      });
  }, [user?.employeeId]);

  useEffect(() => {
    if (!user?.employeeId) return;
    listHolidays({ from: todayStr(), to: addDaysStr(180), rosterGroupId: user.rosterGroupId ?? 'none' })
      .then((holidays) => setUpcomingHolidays(holidays.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)))
      .catch(() => {
        /* non-critical — the dashboard still works without this section */
      });
  }, [user?.employeeId, user?.rosterGroupId]);

  useEffect(() => {
    if (!user?.employeeId) return;
    listCompanyPolicies({ rosterGroupId: user.rosterGroupId ?? 'none', limit: 1 })
      .then((result) => setLatestPolicy(result.data[0] ?? null))
      .catch(() => {
        /* non-critical — the dashboard still works without this section */
      });
  }, [user?.employeeId, user?.rosterGroupId]);

  useEffect(() => {
    if (!user?.employeeId) return;
    const today = todayStr();

    Promise.all([
      // Month-to-date, gap-filled server-side (listMyAttendanceHistory) —
      // every calendar day already carries the right status (holiday/
      // weekoff resolved from the employee's actual shift/roster), so this
      // one call covers both "today's status" and the monthly calendar.
      listMyAttendance({ from: monthStartStr(), to: today }),
      listMyLeaveBalances({ year: new Date().getFullYear() }),
      listMyLeaveRequests({ status: 'pending', limit: 1 }),
      listMyOdRequests({ status: 'pending', limit: 1 }),
      listMyRegularizations({ status: 'pending', limit: 1 }),
    ])
      .then(([attendance, balances, leaveRequests, odRequests, regularizations]) => {
        const todayRecord = attendance.data.find((a) => a.date === today) ?? null;
        // Same present/workingDays definition as MonthlyAttendanceCalendar
        // (holiday/weekoff excluded from the denominator) — kept in sync so
        // the header's "This Month" tile never disagrees with the calendar
        // widget directly below it.
        let monthPresent = 0;
        let monthWorkingDays = 0;
        for (const r of attendance.data) {
          if (r.status === 'present' || r.status === 'on_duty') {
            monthPresent++;
            monthWorkingDays++;
          } else if (r.status === 'half_day' || r.status === 'leave' || r.status === 'absent') {
            monthWorkingDays++;
          }
        }
        setSummary({
          todayStatus: todayRecord?.status ?? null,
          checkIn: todayRecord?.checkIn ?? null,
          checkOut: todayRecord?.checkOut ?? null,
          monthPresent,
          monthWorkingDays,
          leaveBalanceTotal: balances.reduce((sum, b) => sum + Number(b.balance), 0),
          leaveBreakdown: balances.map((b) => ({
            name: b.leaveType?.name ?? 'Leave',
            balance: Number(b.balance),
          })),
          leaveUsage: balances
            .filter((b) => Number(b.allotted) > 0 || Number(b.used) > 0)
            .map((b) => ({ code: b.leaveType?.code ?? b.leaveType?.name ?? 'Leave', used: Number(b.used) })),
          leaveUsedTotal: balances.reduce((sum, b) => sum + Number(b.used), 0),
          pendingRequests:
            leaveRequests.pagination.total + odRequests.pagination.total + regularizations.pagination.total,
          monthAttendance: attendance.data,
        });
      })
      .catch(() => setError('Could not load your dashboard.'));
  }, [user?.employeeId]);

  if (!user?.employeeId) {
    return (
      <EmptyStateCard
        icon={CalendarCheck}
        title="No employee record linked"
        description="Your account isn't linked to an employee record yet. Contact your HR team to get set up."
      />
    );
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (!summary) {
    return <EssDashboardSkeleton />;
  }

  const nextHoliday = upcomingHolidays[0] ?? null;

  const employeeName = displayName ?? user.email.split('@')[0];

  return (
    <div>
      {/* Mobile-only employee ID card — first thing shown on the phone
          dashboard, above the stat tiles. Desktop keeps the existing
          DashboardHeader banner below (hidden here to avoid showing both). */}
      <div className="mb-3 block sm:hidden">
        {/* Same --banner-gradient token as the desktop DashboardHeader banner
            (not from-primary/to-primary-hover) — that token is already
            dimmed per-theme specifically so dark mode doesn't sit a bright
            light-mode blue on top of an otherwise near-black page. */}
        <Link
          to="/ess/profile"
          className="relative block overflow-hidden rounded-3xl pt-4 px-4 shadow-md active:scale-[0.99]"
          style={{ background: 'var(--banner-gradient)' }}
        >
          {/* Faint scattered-dot texture in the top-right corner — purely
              decorative, clipped by the card's own overflow-hidden. */}
          <svg
            className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 text-white/10"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            {Array.from({ length: 6 }).map((_, row) =>
              Array.from({ length: 6 }).map((_, col) => (
                <circle key={`${row}-${col}`} cx={8 + col * 16} cy={8 + row * 16} r="2" fill="currentColor" />
              ))
            )}
          </svg>

          <div className="relative flex items-start gap-3 pb-4">
            <div className="relative shrink-0">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-white/30 bg-white/15 text-xl font-bold text-white">
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt={employeeName} className="h-full w-full object-cover" />
                ) : (
                  initialsFor(employeeName)
                )}
              </div>
              <span
                className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 bg-success"
                style={{ borderColor: 'var(--banner-gradient)' }}
                aria-hidden="true"
              />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-base font-bold text-white">{employeeName}</p>
              <p className="truncate text-xs text-white/70">{designation ?? 'Employee'}</p>
              {employeeStatus && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white">
                  <span className="h-1 w-1 rounded-full bg-success" aria-hidden="true" />
                  {EMPLOYEE_STATUS_LABEL[employeeStatus]}
                </span>
              )}
            </div>
          </div>

          <div className="relative -mx-4 grid grid-cols-3 divide-x divide-white/15 bg-white/10 px-2 py-2.5">
            <div className="flex flex-col items-center gap-1 px-1 text-center">
              <IdCard className="h-3.5 w-3.5 text-white/60" strokeWidth={2} />
              <p className="text-[9px] font-semibold uppercase tracking-wide text-white/60">Employee ID</p>
              <p className="truncate text-xs font-semibold text-white">{employeeCode ?? '—'}</p>
            </div>
            <div className="flex flex-col items-center gap-1 px-1 text-center">
              <CalendarRange className="h-3.5 w-3.5 text-white/60" strokeWidth={2} />
              <p className="text-[9px] font-semibold uppercase tracking-wide text-white/60">Date of Joining</p>
              <p className="truncate text-xs font-semibold text-white">{formatDisplayDate(dateOfJoining)}</p>
            </div>
            <div className="flex flex-col items-center gap-1 px-1 text-center">
              <Briefcase className="h-3.5 w-3.5 text-white/60" strokeWidth={2} />
              <p className="text-[9px] font-semibold uppercase tracking-wide text-white/60">Department</p>
              <p className="truncate text-xs font-semibold text-white">{department ?? '—'}</p>
            </div>
          </div>
        </Link>

        {/* Same "This Month" figure the desktop DashboardHeader banner already
            shows (monthPresent/monthWorkingDays) — reused here rather than
            recomputed, so the two never disagree. */}
        <Link
          to="/ess/attendance"
          className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-md active:scale-[0.99]"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <CalendarCheck className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink-muted">This Month</p>
              <p className="truncate text-2xl font-bold leading-tight text-ink">
                {summary.monthPresent}
                <span className="text-sm font-medium text-ink-muted">/{summary.monthWorkingDays}</span>
              </p>
              <p className="text-[11px] text-ink-muted">Days Present</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(0, summary.monthWorkingDays > 0 ? (summary.monthPresent / summary.monthWorkingDays) * 100 : 0))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <img
            src={theme === 'dark' ? '/time-mobile-dark.png' : '/time-mobile.png'}
            alt=""
            aria-hidden="true"
            className="h-20 w-20 shrink-0 object-contain"
          />
        </Link>
      </div>

      <div className="hidden sm:block">
        <DashboardHeader
          name={employeeName}
          subtitle={designation ?? 'Here’s where things stand today.'}
          subtitleDesktopExtra={designation ? (department ?? undefined) : undefined}
          status={
            employeeStatus
              ? { label: EMPLOYEE_STATUS_LABEL[employeeStatus], tone: employeeStatus === 'active' ? 'success' : 'neutral' }
              : undefined
          }
          tagline="Stay productive, stay positive! You've got this. "
          stat={{
            label: 'This Month',
            value: (
              <>
                {summary.monthPresent}
                <span className="text-sm font-medium text-white/60">/{summary.monthWorkingDays}</span>
              </>
            ),
            hint: 'Days Present',
            icon: CalendarRange,
            progressPct: summary.monthWorkingDays > 0 ? (summary.monthPresent / summary.monthWorkingDays) * 100 : 0,
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <HeroStatTile
          label="Today's Status"
          value={summary.todayStatus ? STATUS_LABEL[summary.todayStatus] ?? summary.todayStatus : 'Not marked yet'}
          icon={CalendarCheck}
          accentColor={palette.categorical[0]}
          hint={
            summary.checkIn && (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                Checked in at {new Date(summary.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )
          }
        />
        <HeroStatTile
          label="Leave Balance (Days)"
          value={summary.leaveBalanceTotal}
          icon={Wallet}
          accentColor={palette.categorical[1]}
          hint={`${summary.leaveUsedTotal} used this year`}
        />
        <HeroStatTile
          label="Pending Requests"
          value={summary.pendingRequests}
          icon={ClipboardList}
          accentColor={palette.categorical[2]}
          hint={summary.pendingRequests > 0 ? 'Awaiting approval' : 'All caught up'}
        />
        <HeroStatTile
          label="Upcoming Holiday"
          value={nextHoliday ? `${daysUntil(nextHoliday.date)}d` : '—'}
          icon={PartyPopper}
          accentColor={palette.categorical[3]}
          hint={
            nextHoliday ? (
              <>
                <p className="truncate font-medium text-ink">{nextHoliday.name}</p>
                <p>{formatDisplayDate(nextHoliday.date)}</p>
              </>
            ) : (
              'No upcoming holiday'
            )
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary sm:h-8 sm:w-8">
                <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
              </span>
              <h3 className="text-sm font-semibold text-ink sm:text-base">Today&apos;s Attendance</h3>
            </div>
            <Badge tone={summary.todayStatus ? STATUS_TONE[summary.todayStatus] ?? 'neutral' : 'neutral'}>
              {summary.todayStatus ? STATUS_LABEL[summary.todayStatus] ?? summary.todayStatus : 'Not marked yet'}
            </Badge>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 sm:gap-3">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-page px-3 py-2.5 sm:px-4 sm:py-3">
              <span className="flex items-center gap-2.5 sm:gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success sm:h-9 sm:w-9">
                  <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
                </span>
                <span className="text-xs text-ink-muted sm:text-sm">Check-in</span>
              </span>
              <span className="text-xs font-semibold text-ink sm:text-sm">
                {summary.checkIn ? new Date(summary.checkIn).toLocaleTimeString() : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-page px-3 py-2.5 sm:px-4 sm:py-3">
              <span className="flex items-center gap-2.5 sm:gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger sm:h-9 sm:w-9">
                  <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
                </span>
                <span className="text-xs text-ink-muted sm:text-sm">Check-out</span>
              </span>
              <span className="text-xs font-semibold text-ink sm:text-sm">
                {summary.checkOut ? new Date(summary.checkOut).toLocaleTimeString() : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-page px-3 py-2.5 sm:px-4 sm:py-3">
              <span className="flex items-center gap-2.5 sm:gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary sm:h-9 sm:w-9">
                  <Timer className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
                </span>
                <span className="text-xs text-ink-muted sm:text-sm">Total Working Hours</span>
              </span>
              <span className="text-xs font-semibold text-ink sm:text-sm">
                {workingHoursLabel(summary.checkIn, summary.checkOut)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-page px-3 py-2.5 sm:px-4 sm:py-3">
              <span className="flex items-center gap-2.5 sm:gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${
                    TONE_CLASSES[summary.todayStatus ? STATUS_TONE[summary.todayStatus] ?? 'neutral' : 'neutral']
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
                </span>
                <span className="text-xs text-ink-muted sm:text-sm">Status</span>
              </span>
              <span className="text-xs font-semibold text-ink sm:text-sm">
                {summary.todayStatus ? STATUS_LABEL[summary.todayStatus] ?? summary.todayStatus : 'Not marked yet'}
              </span>
            </div>
          </div>
          <Link
            to="/ess/attendance"
            className="group mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-primary-light px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white sm:text-sm"
          >
            View Full Attendance
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.75} />
          </Link>
        </div>

        <MonthlyAttendanceCalendar
          year={NOW.getFullYear()}
          month={NOW.getMonth()}
          rows={summary.monthAttendance}
          today={todayStr()}
        />

        <MyLeaveBalanceChart data={summary.leaveBreakdown} usage={summary.leaveUsage} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <QuickActions actions={quickActions} />
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary sm:h-8 sm:w-8">
                <Megaphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
              </span>
              <h3 className="text-sm font-semibold text-ink sm:text-base">Company Notices</h3>
            </div>
            <Link to="/ess/holidays" className="text-xs font-medium text-primary hover:underline">
              View All
            </Link>
          </div>

          {upcomingHolidays.length === 0 && !latestPolicy ? (
            <p className="flex-1 text-xs text-ink-muted sm:text-sm">Nothing new to report right now.</p>
          ) : (
            <ul className="flex-1 space-y-2 sm:space-y-2.5">
              {upcomingHolidays.slice(0, 2).map((holiday) => (
                <li key={holiday.id} className="rounded-lg bg-page px-3 py-2.5 sm:px-3.5 sm:py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink sm:text-sm">{holiday.name}</p>
                      <p className="text-[11px] text-ink-muted sm:text-xs">{formatDisplayDate(holiday.date)}</p>
                    </div>
                    <Badge tone="neutral">{daysUntil(holiday.date)}d away</Badge>
                  </div>
                </li>
              ))}
              {latestPolicy && (
                <li className="rounded-lg bg-page px-3 py-2.5 sm:px-3.5 sm:py-3">
                  <Link to="/ess/policies" className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink sm:text-sm">{latestPolicy.title}</p>
                      <p className="text-[11px] text-ink-muted sm:text-xs">Company Policy</p>
                    </div>
                    <Badge tone="success">Update</Badge>
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {myManagers.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md sm:p-5">
          <div className="mb-2.5 flex items-center gap-2 sm:mb-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary sm:h-8 sm:w-8">
              <UserCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
            </span>
            <h3 className="text-sm font-semibold text-ink sm:text-base">
              Your {myManagers.length > 1 ? `${myManagers.length} Managers` : 'Manager'}
            </h3>
          </div>
          {myManagers.length > 1 && (
            <p className="mb-2 text-xs text-ink-muted sm:text-sm">
              A leave request needs every one of them to approve before it's final — see the status on{' '}
              <Link to="/ess/leave" className="text-primary hover:underline">
                My Leave
              </Link>
              .
            </p>
          )}
          <ul className="flex flex-wrap gap-1.5 sm:gap-2">
            {myManagers.map((manager) => (
              <li
                key={manager.id}
                className="rounded-full border border-border bg-page px-2.5 py-1 text-xs font-medium text-ink sm:text-sm"
              >
                {manager.name || manager.employeeCode || 'Unnamed'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {myPowers.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md sm:p-5">
          <div className="mb-2.5 flex items-center gap-2 sm:mb-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary sm:h-8 sm:w-8">
              <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
            </span>
            <h3 className="text-sm font-semibold text-ink sm:text-base">Your Additional Responsibilities</h3>
          </div>
          <ul className="space-y-1.5 sm:space-y-2">
            {myPowers.map((power) => (
              <li key={power.key} className="text-xs sm:text-sm">
                <span className="font-medium text-ink">{power.label}</span>
                <span className="text-ink-muted"> — {power.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

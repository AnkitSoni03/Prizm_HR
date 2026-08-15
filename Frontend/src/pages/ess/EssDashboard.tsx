import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  LogIn,
  LogOut,
  PartyPopper,
  RefreshCw,
  Send,
  ShieldCheck,
  Timer,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';
import { listMyAttendance, listMyRegularizations, type Attendance } from '../../api/ess/attendance';
import { listHolidays, listMyLeaveBalances, listMyLeaveRequests, type Holiday } from '../../api/ess/leave';
import { listMyOdRequests } from '../../api/ess/od';
import { getMyProfile, type EmployeeProfile } from '../../api/ess/profile';
import { listPowers, type Power } from '../../api/powers';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { HeroStatTile } from '../../components/ui/HeroStatTile';
import { StatTileSkeleton } from '../../components/ui/StatTile';
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

const EMPLOYEE_STATUS_LABEL: Record<EmployeeProfile['status'], string> = {
  onboarding: 'Onboarding',
  active: 'Active',
  on_notice: 'On Notice',
  exited: 'Exited',
  archived: 'Archived',
};

const QUICK_ACTIONS: QuickAction[] = [
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
  const [subtitle, setSubtitle] = useState('Here’s where things stand today.');
  const [employeeStatus, setEmployeeStatus] = useState<EmployeeProfile['status'] | null>(null);
  const [upcomingHolidays, setUpcomingHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [myPowers, setMyPowers] = useState<Power[]>([]);

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

  useEffect(() => {
    if (!user?.employeeId) return;
    getMyProfile(user.employeeId)
      .then((profile) => {
        setDisplayName(profile.name);
        setEmployeeStatus(profile.status);
        const parts = [profile.designation?.title, profile.department?.name].filter(Boolean);
        if (parts.length > 0) setSubtitle(parts.join(' · '));
      })
      .catch(() => {
        /* non-critical — falls back to email in the greeting */
      });
  }, [user?.employeeId]);

  useEffect(() => {
    if (!user?.employeeId) return;
    listHolidays({ from: todayStr(), to: addDaysStr(180) })
      .then((holidays) => setUpcomingHolidays(holidays.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)))
      .catch(() => {
        /* non-critical — the dashboard still works without this section */
      });
  }, [user?.employeeId]);

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
        setSummary({
          todayStatus: todayRecord?.status ?? null,
          checkIn: todayRecord?.checkIn ?? null,
          checkOut: todayRecord?.checkOut ?? null,
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
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
    );
  }

  const nextHoliday = upcomingHolidays[0] ?? null;

  return (
    <div>
      <DashboardHeader
        name={displayName ?? user.email.split('@')[0]}
        subtitle={subtitle}
        status={
          employeeStatus
            ? { label: EMPLOYEE_STATUS_LABEL[employeeStatus], tone: employeeStatus === 'active' ? 'success' : 'neutral' }
            : undefined
        }
      />

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
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md sm:p-5">
          <div className="mb-3 flex items-center gap-2 sm:mb-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary sm:h-8 sm:w-8">
              <PartyPopper className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
            </span>
            <h3 className="text-sm font-semibold text-ink sm:text-base">Upcoming Holidays</h3>
          </div>
          {upcomingHolidays.length === 0 ? (
            <p className="flex-1 text-xs text-ink-muted sm:text-sm">No holidays scheduled in the next 6 months.</p>
          ) : (
            <ul className="flex-1 space-y-2 sm:space-y-2.5">
              {upcomingHolidays.map((holiday) => (
                <li
                  key={holiday.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-primary-light/60 px-3 py-2.5 sm:px-3.5 sm:py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink sm:text-sm">{holiday.name}</p>
                    <p className="text-[11px] text-ink-muted sm:text-xs">{formatDisplayDate(holiday.date)}</p>
                  </div>
                  <Badge tone="neutral">{daysUntil(holiday.date)}d away</Badge>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/ess/holidays"
            className="group mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-primary-light px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white sm:text-sm"
          >
            View All Holidays
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.75} />
          </Link>
        </div>

        <div className="lg:col-span-2">
          <QuickActions actions={QUICK_ACTIONS} />
        </div>
      </div>

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

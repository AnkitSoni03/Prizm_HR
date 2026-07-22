import { useEffect, useState } from 'react';
import {
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  FileText,
  LogIn,
  LogOut,
  PartyPopper,
  RefreshCw,
  Send,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';
import { listMyAttendance, listMyRegularizations } from '../../api/ess/attendance';
import { listHolidays, listMyLeaveBalances, listMyLeaveRequests, type Holiday } from '../../api/ess/leave';
import { listMyOdRequests } from '../../api/ess/od';
import { getMyProfile } from '../../api/ess/profile';
import { listPowers, type Power } from '../../api/powers';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { StatTile, StatTileSkeleton } from '../../components/ui/StatTile';
import { Badge } from '../../components/ui/Badge';
import { DashboardHeader } from '../../components/DashboardHeader';
import { QuickActions, type QuickAction } from '../../components/QuickActions';
import { MyLeaveBalanceChart, type LeaveBalanceEntry } from '../../components/charts/MyLeaveBalanceChart';
import { formatDisplayDate } from '../../utils/dateDisplay';

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Apply Leave', to: '/ess/leave', icon: CalendarClock },
  { label: 'Raise Regularization', to: '/ess/attendance?tab=requests', icon: CalendarCheck },
  { label: 'Apply OD', to: '/ess/od', icon: Send },
  { label: 'My Comp-Off', to: '/ess/comp-off', icon: RefreshCw },
  { label: 'My Payslips', to: '/ess/payslips', icon: Wallet },
  { label: 'Company Policies', to: '/ess/policies', icon: FileText },
];

interface Summary {
  todayStatus: string | null;
  checkIn: string | null;
  checkOut: string | null;
  leaveBalanceTotal: number;
  leaveBreakdown: LeaveBalanceEntry[];
  pendingRequests: number;
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
      listMyAttendance({ from: today, to: today }),
      listMyLeaveBalances({ year: new Date().getFullYear() }),
      listMyLeaveRequests({ status: 'pending', limit: 1 }),
      listMyOdRequests({ status: 'pending', limit: 1 }),
      listMyRegularizations({ status: 'pending', limit: 1 }),
    ])
      .then(([attendance, balances, leaveRequests, odRequests, regularizations]) => {
        const todayRecord = attendance.data[0] ?? null;
        setSummary({
          todayStatus: todayRecord?.status ?? null,
          checkIn: todayRecord?.checkIn ?? null,
          checkOut: todayRecord?.checkOut ?? null,
          leaveBalanceTotal: balances.reduce((sum, b) => sum + Number(b.balance), 0),
          leaveBreakdown: balances.map((b) => ({
            name: b.leaveType?.name ?? 'Leave',
            balance: Number(b.balance),
          })),
          pendingRequests:
            leaveRequests.pagination.total + odRequests.pagination.total + regularizations.pagination.total,
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
    );
  }

  const nextHoliday = upcomingHolidays[0] ?? null;

  // Each tile takes a distinct hue from the same theme-aware categorical
  // palette the leave donut chart's legend uses (utils/chartColors.ts), so
  // the multi-color tiles still read as one consistent set rather than
  // arbitrary per-tile colors.
  const tiles = [
    {
      label: "Today's Status",
      value: summary.todayStatus ? STATUS_LABEL[summary.todayStatus] ?? summary.todayStatus : 'Not marked yet',
      icon: CalendarCheck,
      tone: 'filled' as const,
      accentColor: palette.categorical[0],
    },
    {
      label: 'Leave Balance (Days)',
      value: summary.leaveBalanceTotal.toString(),
      icon: Wallet,
      tone: 'soft' as const,
      accentColor: palette.categorical[1],
    },
    {
      label: 'Pending Requests',
      value: summary.pendingRequests.toString(),
      icon: ClipboardList,
      tone: 'filled' as const,
      accentColor: palette.categorical[2],
    },
    {
      label: nextHoliday ? nextHoliday.name : 'No upcoming holiday',
      value: nextHoliday ? `${daysUntil(nextHoliday.date)}d` : '—',
      icon: PartyPopper,
      tone: 'soft' as const,
      accentColor: palette.categorical[3],
    },
  ];

  return (
    <div>
      <DashboardHeader name={displayName ?? user.email.split('@')[0]} subtitle={subtitle} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            icon={tile.icon}
            tone={tile.tone}
            accentColor={tile.accentColor}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">Today&apos;s Attendance</h3>
              <Badge tone={summary.todayStatus ? STATUS_TONE[summary.todayStatus] ?? 'neutral' : 'neutral'}>
                {summary.todayStatus ? STATUS_LABEL[summary.todayStatus] ?? summary.todayStatus : 'Not marked yet'}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg bg-page px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                  <LogIn className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-xs text-ink-muted">Check-in</p>
                  <p className="text-sm font-medium text-ink">
                    {summary.checkIn ? new Date(summary.checkIn).toLocaleTimeString() : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-page px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
                  <LogOut className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-xs text-ink-muted">Check-out</p>
                  <p className="text-sm font-medium text-ink">
                    {summary.checkOut ? new Date(summary.checkOut).toLocaleTimeString() : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="mb-4 flex items-center gap-2">
              <PartyPopper className="h-4 w-4 text-primary" strokeWidth={1.75} />
              <h3 className="text-base font-semibold text-ink">Upcoming Holidays</h3>
            </div>
            {upcomingHolidays.length === 0 ? (
              <p className="text-sm text-ink-muted">No holidays scheduled in the next 6 months.</p>
            ) : (
              <ul className="divide-y divide-border">
                {upcomingHolidays.map((holiday) => (
                  <li key={holiday.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-ink">{holiday.name}</p>
                      <p className="text-xs text-ink-muted">{formatDisplayDate(holiday.date)}</p>
                    </div>
                    <Badge tone="neutral">{daysUntil(holiday.date)}d away</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {myPowers.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.75} />
                <h3 className="text-base font-semibold text-ink">Your Additional Responsibilities</h3>
              </div>
              <ul className="space-y-2">
                {myPowers.map((power) => (
                  <li key={power.key} className="text-sm">
                    <span className="font-medium text-ink">{power.label}</span>
                    <span className="text-ink-muted"> — {power.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <MyLeaveBalanceChart data={summary.leaveBreakdown} />
      </div>

      <div className="mt-4">
        <QuickActions actions={QUICK_ACTIONS} />
      </div>
    </div>
  );
}

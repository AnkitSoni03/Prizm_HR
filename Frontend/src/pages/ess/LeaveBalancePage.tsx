import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Baby,
  CalendarClock,
  CheckCircle2,
  Clock,
  HeartPulse,
  Palmtree,
  Plane,
  RefreshCw,
  Send,
  Star,
  Umbrella,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';
import { listLeaveTypes, listMyLeaveBalances, type LeaveBalance, type LeaveType } from '../../api/ess/leave';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

const STATUS_ICON: Record<'success' | 'warning' | 'danger', LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

type LeaveCategory = 'annual' | 'short' | 'casual' | 'sick' | 'maternity' | 'paternity' | 'comp' | 'special' | 'lwp';

// icon + a fixed index into the 4-hue chart palette (0 blue, 1 green,
// 2 amber, 3 violet) HeroStatTile/QuickActions already use, so identity
// colors stay theme-safe (Short=green, Annual=blue, Casual=violet,
// matching the reference design).
const CATEGORY_VISUAL: Record<LeaveCategory, { icon: LucideIcon; accentIndex: number }> = {
  annual: { icon: Plane, accentIndex: 0 },
  short: { icon: Umbrella, accentIndex: 1 },
  casual: { icon: Palmtree, accentIndex: 3 },
  sick: { icon: HeartPulse, accentIndex: 2 },
  maternity: { icon: Baby, accentIndex: 1 },
  paternity: { icon: Users, accentIndex: 0 },
  comp: { icon: RefreshCw, accentIndex: 3 },
  special: { icon: Star, accentIndex: 2 },
  lwp: { icon: Clock, accentIndex: 2 },
};

// Leave types are a company-defined catalog — a company picks its own
// short code (confirmed live against this dev company's actual codes:
// AL/SL/CL/SICK/CO, not the longer words this used to key off of, which
// silently fell through to the Wallet/cycled-color fallback for every
// card). Matched by exact code first (case-insensitive), then by keyword
// in the type's name, so an unrecognized company-specific code still has
// a real shot at a matching icon instead of only ever hitting the
// generic fallback.
const CATEGORY_BY_CODE: Record<string, LeaveCategory> = {
  AL: 'annual',
  ANNUAL: 'annual',
  EL: 'annual',
  SL: 'short',
  SHORT: 'short',
  CL: 'casual',
  CASUAL: 'casual',
  SICK: 'sick',
  SI: 'sick',
  ML: 'maternity',
  MATERNITY: 'maternity',
  PTL: 'paternity',
  PATERNITY: 'paternity',
  CO: 'comp',
  COMP: 'comp',
  COMPOFF: 'comp',
  SPL: 'special',
  SPECIAL: 'special',
  LWP: 'lwp',
  UPL: 'lwp',
};

const NAME_KEYWORD_CATEGORY: [string, LeaveCategory][] = [
  ['annual', 'annual'],
  ['privilege', 'annual'],
  ['earned', 'annual'],
  ['short', 'short'],
  ['casual', 'casual'],
  ['sick', 'sick'],
  ['maternity', 'maternity'],
  ['paternity', 'paternity'],
  ['comp', 'comp'],
  ['special', 'special'],
  ['without pay', 'lwp'],
  ['unpaid', 'lwp'],
  ['lwp', 'lwp'],
];

function resolveLeaveCategory(type: LeaveType): LeaveCategory | null {
  const byCode = CATEGORY_BY_CODE[type.code.trim().toUpperCase()];
  if (byCode) return byCode;
  const lowerName = type.name.toLowerCase();
  const byName = NAME_KEYWORD_CATEGORY.find(([keyword]) => lowerName.includes(keyword));
  return byName ? byName[1] : null;
}

const ACCRUAL_LABELS: Record<'yearly' | 'monthly' | 'monthly_reset', string> = {
  yearly: 'Full quota given upfront each year',
  monthly: 'Grows by 1/12th every month',
  monthly_reset: 'Resets to the flat amount every month',
};

function statusFor(allotted: number, used: number, remaining: number): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (remaining <= 0) return { label: 'Exhausted', tone: 'danger' };
  const usagePercent = allotted > 0 ? (used / allotted) * 100 : 0;
  if (usagePercent >= 50) return { label: 'Running Low', tone: 'warning' };
  return { label: 'Available', tone: 'success' };
}

// "My Leave Balance" — split out from MyLeavePage.tsx into its own page so
// it matches the dedicated sidebar item design (per your screenshot)
// instead of a small inline grid squeezed above the apply/history list.
// Each card is themed by the same 4-hue, contrast-validated chart palette
// HeroStatTile/QuickActions already cycle through — leave types are a
// company-defined catalog (arbitrary codes), so per-code hardcoded colors
// can't scale the way index-based cycling does.
export function LeaveBalancePage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);
    Promise.all([listLeaveTypes({ rosterGroupId: user?.rosterGroupId ?? 'none' }), listMyLeaveBalances({ year })])
      .then(([types, bal]) => {
        setLeaveTypes(types);
        setBalances(bal);
      })
      .catch(() => setError('Could not load your leave balances.'))
      .finally(() => setIsLoading(false));
  }, [year, user?.rosterGroupId]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink sm:text-lg">My Leave Balance</h2>
          <span className="mt-1.5 block h-1 w-8 rounded-full bg-primary" aria-hidden="true" />
          <p className="mt-2 text-xs text-ink-muted sm:text-sm">View your time off allocations and usage</p>
        </div>
        <div className="relative hidden shrink-0 md:block">
          {theme === 'dark' && (
            <div
              className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-50 blur-3xl"
              style={{ backgroundColor: '#2f5fe0' }}
              aria-hidden="true"
            />
          )}
          <img
            src={theme === 'dark' ? '/leave-balance-dark.png' : '/leave-balance-img.png'}
            alt=""
            aria-hidden="true"
            className="h-28 w-auto object-contain lg:h-32 xl:h-36"
          />
        </div>
        <div className="w-full sm:w-36">
          <Select
            id="leave-balance-year"
            label="Year"
            value={String(year)}
            onChange={(event) => setYear(Number(event.target.value))}
            options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-danger sm:text-sm">{error}</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl border border-border bg-card sm:h-40" />
          ))}
        </div>
      )}

      {!isLoading && !error && leaveTypes.length === 0 && (
        <p className="text-xs text-ink-muted sm:text-sm">
          Your leave balances will appear here once a Roster with a Leave Policy is assigned to you. Contact HR if
          you think this is a mistake.
        </p>
      )}

      {!isLoading && leaveTypes.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {leaveTypes.map((type, i) => {
              const balance = balances.find((b) => b.leaveTypeId === type.id);
              const allotted = balance ? Number(balance.allotted) : 0;
              const used = balance ? Number(balance.used) : 0;
              const remaining = balance ? Number(balance.balance) : 0;
              const usagePercent = allotted > 0 ? Math.min(100, Math.round((used / allotted) * 100)) : 0;
              const status = statusFor(allotted, used, remaining);
              const category = resolveLeaveCategory(type);
              const visual = category ? CATEGORY_VISUAL[category] : null;
              const Icon = visual?.icon ?? Wallet;
              const accentIndex = visual?.accentIndex ?? i % palette.categorical.length;
              const accentColor = palette.categorical[accentIndex];

              return (
                <div
                  key={type.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-md sm:p-7"
                >
                  <div
                    className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl sm:mb-6 sm:h-12 sm:w-12"
                    style={{ backgroundColor: `${accentColor}1f`, color: accentColor }}
                  >
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
                  </div>
                  <p className="truncate text-sm font-semibold sm:text-base" style={{ color: accentColor }}>
                    {type.name}
                  </p>
                  <p className="mt-1 text-[10px] text-ink-muted sm:text-xs">
                    {balance?.accrual ? ACCRUAL_LABELS[balance.accrual] : 'Accrual not set'}
                  </p>
                  <p className="mb-3.5 text-[10px] text-ink-muted sm:mb-5 sm:text-xs">
                    {type.carryForward
                      ? `Carries forward — up to ${type.maxCarryForwardDays != null ? `${type.maxCarryForwardDays} days` : 'unlimited'} into next year`
                      : 'Does not carry forward — unused days expire at year end'}
                  </p>

                  <div
                    className="mb-3.5 grid grid-cols-3 divide-x divide-border rounded-lg py-2.5 text-center sm:mb-5 sm:py-3.5"
                    style={{ backgroundColor: `${accentColor}14` }}
                  >
                    <div>
                      <p className="text-base font-bold sm:text-lg" style={{ color: accentColor }}>
                        {allotted}
                      </p>
                      <p className="text-[9px] uppercase tracking-wide text-ink-muted sm:text-[10px]">Total</p>
                    </div>
                    <div>
                      <p className="text-base font-bold sm:text-lg" style={{ color: accentColor }}>
                        {used}
                      </p>
                      <p className="text-[9px] uppercase tracking-wide text-ink-muted sm:text-[10px]">Used</p>
                    </div>
                    <div>
                      <p className="text-base font-bold sm:text-lg" style={{ color: accentColor }}>
                        {remaining}
                      </p>
                      <p className="text-[9px] uppercase tracking-wide text-ink-muted sm:text-[10px]">Remaining</p>
                    </div>
                  </div>

                  <div className="mb-2 flex items-center justify-between text-[11px] text-ink-muted sm:mb-2.5 sm:text-xs">
                    <span>Usage</span>
                    <span>{usagePercent}%</span>
                  </div>
                  <div className="mb-3.5 h-1.5 w-full overflow-hidden rounded-full bg-page sm:mb-5">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${usagePercent}%`, backgroundColor: accentColor }}
                    />
                  </div>

                  <Badge tone={status.tone}>
                    <span className="inline-flex items-center gap-1">
                      {(() => {
                        const StatusIcon = STATUS_ICON[status.tone];
                        return <StatusIcon className="h-3.5 w-3.5" strokeWidth={2} />;
                      })()}
                      {status.label}
                    </span>
                  </Badge>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-border bg-[#d9e2fc] p-4 dark:bg-primary-light sm:mt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-xs sm:h-11 sm:w-11">
                <CalendarClock className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink sm:text-base">Plan your time off smartly</p>
                <p className="text-xs text-ink-muted sm:text-sm">
                  Check your leave balance, plan ahead, and enjoy a healthy work-life balance.
                </p>
              </div>
            </div>
            <Link
              to="/ess/leave"
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-xs transition-colors hover:bg-primary hover:text-white sm:w-auto"
            >
              <Send className="h-4 w-4" strokeWidth={1.75} />
              Apply Leave
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

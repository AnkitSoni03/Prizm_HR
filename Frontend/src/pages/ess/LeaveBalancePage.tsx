import { useEffect, useState } from 'react';
import { Baby, Clock, Star, Users, Waves, Wallet, type LucideIcon } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { listLeaveTypes, listMyLeaveBalances, type LeaveBalance, type LeaveType } from '../../api/ess/leave';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

const ICON_BY_CODE: Record<string, LucideIcon> = {
  ANNUAL: Waves,
  SHORT: Clock,
  SPECIAL: Star,
  MATERNITY: Baby,
  PATERNITY: Users,
};

const ACCENT_BY_CODE: Record<string, string> = {
  ANNUAL: 'bg-primary/10 text-primary',
  SHORT: 'bg-warning/10 text-warning',
  SPECIAL: 'bg-danger/10 text-danger',
  MATERNITY: 'bg-success/10 text-success',
  PATERNITY: 'bg-primary/10 text-primary',
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
export function LeaveBalancePage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);
    Promise.all([listLeaveTypes(), listMyLeaveBalances({ year })])
      .then(([types, bal]) => {
        setLeaveTypes(types);
        setBalances(bal);
      })
      .catch(() => setError('Could not load your leave balances.'))
      .finally(() => setIsLoading(false));
  }, [year]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">My Leave Balance</h2>
          <p className="text-sm text-ink-muted">View your time off allocations</p>
        </div>
        <div className="w-full sm:w-32">
          <Select
            id="leave-balance-year"
            label="Year"
            value={String(year)}
            onChange={(event) => setYear(Number(event.target.value))}
            options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {!isLoading && !error && leaveTypes.length === 0 && (
        <p className="text-sm text-ink-muted">Your leave balances will appear here once set up.</p>
      )}

      {!isLoading && leaveTypes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leaveTypes.map((type) => {
            const balance = balances.find((b) => b.leaveTypeId === type.id);
            const allotted = balance ? Number(balance.allotted) : 0;
            const used = balance ? Number(balance.used) : 0;
            const remaining = balance ? Number(balance.balance) : 0;
            const usagePercent = allotted > 0 ? Math.min(100, Math.round((used / allotted) * 100)) : 0;
            const status = statusFor(allotted, used, remaining);
            const Icon = ICON_BY_CODE[type.code] ?? Wallet;
            const accentClass = ACCENT_BY_CODE[type.code] ?? 'bg-primary/10 text-primary';

            return (
              <div key={type.id} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accentClass}`}>
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                </div>
                <p className="mb-3 text-sm font-semibold text-ink">{type.name}</p>

                <div className="mb-3 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-page py-2 text-center">
                  <div>
                    <p className="text-lg font-semibold text-ink">{allotted}</p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-muted">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-ink">{used}</p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-muted">Used</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-ink">{remaining}</p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-muted">Remaining</p>
                  </div>
                </div>

                <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
                  <span>Usage</span>
                  <span>{usagePercent}%</span>
                </div>
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-page">
                  <div
                    className={`h-full rounded-full ${status.tone === 'danger' ? 'bg-danger' : status.tone === 'warning' ? 'bg-warning' : 'bg-primary'}`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>

                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

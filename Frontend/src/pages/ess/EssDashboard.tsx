import { useEffect, useState } from 'react';
import { CalendarCheck, ClipboardList, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { listMyAttendance, listMyRegularizations } from '../../api/ess/attendance';
import { listMyLeaveBalances, listMyLeaveRequests } from '../../api/ess/leave';
import { listMyOdRequests } from '../../api/ess/od';
import { listPowers, type Power } from '../../api/powers';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { StatTile, StatTileSkeleton } from '../../components/ui/StatTile';

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

interface Summary {
  todayStatus: string | null;
  checkIn: string | null;
  checkOut: string | null;
  leaveBalanceTotal: number;
  pendingRequests: number;
}

// No backend dashboard-summary endpoint covers Employees (/dashboard/summary
// is company:read only) — this composes the tiles client-side from the
// same *_own-scoped list endpoints the other ESS pages use.
export function EssDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
    );
  }

  const tiles = [
    {
      label: "Today's Status",
      value: summary.todayStatus ? STATUS_LABEL[summary.todayStatus] ?? summary.todayStatus : 'Not marked yet',
      icon: CalendarCheck,
    },
    { label: 'Leave Balance', value: summary.leaveBalanceTotal.toString(), icon: Wallet },
    { label: 'Pending Requests', value: summary.pendingRequests.toString(), icon: ClipboardList },
  ];

  return (
    <div>
      <p className="mb-6 text-sm text-ink-muted">
        Welcome back{user.email ? `, ${user.email}` : ''}. Here&apos;s where things stand today.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} />
        ))}
      </div>
      {(summary.checkIn || summary.checkOut) && (
        <div className="mt-4 rounded-xl border border-border bg-card p-5 text-sm text-ink-muted shadow-xs">
          {summary.checkIn && <p>Checked in at {new Date(summary.checkIn).toLocaleTimeString()}</p>}
          {summary.checkOut && <p>Checked out at {new Date(summary.checkOut).toLocaleTimeString()}</p>}
        </div>
      )}

      {myPowers.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-ink">Your Additional Responsibilities</h2>
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
  );
}

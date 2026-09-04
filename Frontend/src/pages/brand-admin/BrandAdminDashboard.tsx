import { useEffect, useState, type ComponentType } from 'react';
import { Building2, CalendarCheck, CalendarClock, ClipboardCheck, RefreshCw, Send, Users } from 'lucide-react';
import { getBrandDashboardSummary } from '../../api/brandAdmin/dashboard';
import type { DashboardSummary } from '../../api/companyAdmin/dashboard';
import { StatTile, StatTileSkeleton } from '../../components/ui/StatTile';
import { DashboardHeader } from '../../components/DashboardHeader';
import { QuickActions } from '../../components/QuickActions';
import { EmployeeTrendChart } from '../../components/charts/EmployeeTrendChart';
import { LeaveDonutChart } from '../../components/charts/LeaveDonutChart';
import { DepartmentHeadcountBars } from '../../components/charts/DepartmentHeadcountBars';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';

interface Tile {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  accentColor: string;
}

// A distinct hue for the one "count" metric (from the same categorical
// palette the charts below already use), and a single consistent warning
// hue across every "Pending ..." tile — ties their shared meaning ("needs
// your attention") together instead of a decorative rainbow.
function tilesFor(summary: DashboardSummary, categorical: string[]): Tile[] {
  return [
    { label: 'Employees', value: summary.employeeCount, icon: Users, accentColor: categorical[0] },
    { label: 'Pending Leave Requests', value: summary.pendingLeaveRequests, icon: CalendarClock, accentColor: 'var(--warning)' },
    { label: 'Pending OD Requests', value: summary.pendingOdRequests, icon: Send, accentColor: 'var(--warning)' },
    { label: 'Pending Regularizations', value: summary.pendingRegularizations, icon: ClipboardCheck, accentColor: 'var(--warning)' },
    { label: 'Pending Comp-Off Credits', value: summary.pendingCompOffCredits, icon: RefreshCw, accentColor: 'var(--warning)' },
  ];
}

const QUICK_ACTIONS = [
  { label: 'Employees', to: '/brand-admin/employees', icon: Users },
  { label: 'Organization', to: '/brand-admin/organization', icon: Building2 },
  { label: 'Shifts', to: '/brand-admin/shifts-rosters', icon: CalendarCheck },
  { label: 'Approvals', to: '/brand-admin/approvals', icon: ClipboardCheck },
];

export function BrandAdminDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const brandId = user?.roles.find((role) => role.name === 'Brand Admin')?.brandId ?? null;
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!brandId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('No Brand is linked to this account.');
      return;
    }
    getBrandDashboardSummary(brandId)
      .then(setSummary)
      .catch(() => setError('Could not load dashboard summary.'));
  }, [brandId]);

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (!summary) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <DashboardHeader
        name={user?.email.split('@')[0] ?? 'Admin'}
        subtitle="Here's what's happening in your brand today."      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tilesFor(summary, palette.categorical).map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} accentColor={tile.accentColor} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EmployeeTrendChart data={summary.employeeTrend} />
        </div>
        <LeaveDonutChart data={summary.leaveBreakdown} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DepartmentHeadcountBars data={summary.departmentHeadcount} />
        <QuickActions actions={QUICK_ACTIONS} />
      </div>
    </div>
  );
}

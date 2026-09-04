import { useEffect, useState, type ComponentType } from 'react';
import { Building2, CalendarClock, ClipboardCheck, Send, Settings, Users } from 'lucide-react';
import { getGroupDashboardSummary, type GroupDashboardSummary } from '../../api/groupAdmin/dashboard';
import { StatTile, StatTileSkeleton } from '../../components/ui/StatTile';
import { DashboardHeader } from '../../components/DashboardHeader';
import { QuickActions } from '../../components/QuickActions';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { getChartPalette } from '../../utils/chartColors';

interface Tile {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  accentColor: string;
}

// A distinct hue per "count" metric (from the same categorical palette
// Company/Brand Admin's dashboards use, so the look stays consistent across
// every admin portal), and a single consistent warning hue across every
// "Pending ..." tile — ties their shared meaning ("needs your attention")
// together instead of a decorative rainbow.
function tilesFor(summary: GroupDashboardSummary, categorical: string[]): Tile[] {
  return [
    { label: 'Companies', value: summary.companyCount, icon: Building2, accentColor: categorical[0] },
    { label: 'Employees', value: summary.employeeCount, icon: Users, accentColor: categorical[1] },
    { label: 'Pending Leave Requests', value: summary.pendingLeaveRequests, icon: CalendarClock, accentColor: 'var(--warning)' },
    { label: 'Pending OD Requests', value: summary.pendingOdRequests, icon: Send, accentColor: 'var(--warning)' },
    { label: 'Pending Regularizations', value: summary.pendingRegularizations, icon: ClipboardCheck, accentColor: 'var(--warning)' },
  ];
}

const QUICK_ACTIONS = [
  { label: 'Companies', to: '/group-admin/companies', icon: Building2 },
  { label: 'Settings', to: '/group-admin/settings', icon: Settings },
];

export function GroupAdminDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const palette = getChartPalette(theme);
  const [summary, setSummary] = useState<GroupDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGroupDashboardSummary()
      .then(setSummary)
      .catch(() => setError('Could not load dashboard summary.'));
  }, []);

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
        subtitle="Here's what's happening across your group today."      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tilesFor(summary, palette.categorical).map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} accentColor={tile.accentColor} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <QuickActions actions={QUICK_ACTIONS} />
      </div>
    </div>
  );
}

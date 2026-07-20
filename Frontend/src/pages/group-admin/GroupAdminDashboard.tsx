import { useEffect, useState, type ComponentType } from 'react';
import { Building2, CalendarClock, ClipboardCheck, Send, Users } from 'lucide-react';
import { getGroupDashboardSummary, type GroupDashboardSummary } from '../../api/groupAdmin/dashboard';
import { StatTile, StatTileSkeleton } from '../../components/ui/StatTile';
import { DashboardHeader } from '../../components/DashboardHeader';
import { QuickActions } from '../../components/QuickActions';
import { useAuth } from '../../context/auth-context';

interface Tile {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: 'soft' | 'filled';
}

function tilesFor(summary: GroupDashboardSummary): Tile[] {
  return [
    { label: 'Companies', value: summary.companyCount, icon: Building2, tone: 'filled' },
    { label: 'Employees', value: summary.employeeCount, icon: Users, tone: 'soft' },
    { label: 'Pending Leave Requests', value: summary.pendingLeaveRequests, icon: CalendarClock, tone: 'filled' },
    { label: 'Pending OD Requests', value: summary.pendingOdRequests, icon: Send, tone: 'soft' },
    { label: 'Pending Regularizations', value: summary.pendingRegularizations, icon: ClipboardCheck, tone: 'soft' },
  ];
}

const QUICK_ACTIONS = [{ label: 'Companies', to: '/group-admin/companies', icon: Building2 }];

export function GroupAdminDashboard() {
  const { user } = useAuth();
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
        subtitle="Here's what's happening across your group today."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tilesFor(summary).map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} tone={tile.tone} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <QuickActions actions={QUICK_ACTIONS} />
      </div>
    </div>
  );
}

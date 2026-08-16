import { useEffect, useState, type ComponentType } from 'react';
import {
  Building2,
  CalendarClock,
  CalendarCheck,
  ClipboardCheck,
  Send,
  Users,
} from 'lucide-react';
import { getDashboardSummary, type DashboardSummary } from '../../api/companyAdmin/dashboard';
import { StatTile, StatTileSkeleton } from '../../components/ui/StatTile';
import { DashboardHeader } from '../../components/DashboardHeader';
import { QuickActions } from '../../components/QuickActions';
import { EmployeeTrendChart } from '../../components/charts/EmployeeTrendChart';
import { LeaveDonutChart } from '../../components/charts/LeaveDonutChart';
import { DepartmentHeadcountBars } from '../../components/charts/DepartmentHeadcountBars';
import { useAuth } from '../../context/auth-context';

interface Tile {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: 'soft' | 'filled';
}

function tilesFor(summary: DashboardSummary): Tile[] {
  return [
    { label: 'Brands', value: summary.brandCount, icon: Building2, tone: 'filled' },
    { label: 'Employees', value: summary.employeeCount, icon: Users, tone: 'soft' },
    { label: 'Pending Leave Requests', value: summary.pendingLeaveRequests, icon: CalendarClock, tone: 'filled' },
    { label: 'Pending OD Requests', value: summary.pendingOdRequests, icon: Send, tone: 'soft' },
    { label: 'Pending Regularizations', value: summary.pendingRegularizations, icon: ClipboardCheck, tone: 'soft' },
  ];
}

const QUICK_ACTIONS = [
  { label: 'Employees', to: '/company-admin/employees', icon: Users },
  { label: 'Organization', to: '/company-admin/organization', icon: Building2 },
  { label: 'Shifts & Rosters', to: '/company-admin/shifts-rosters', icon: CalendarCheck },
  { label: 'Approvals', to: '/company-admin/approvals', icon: ClipboardCheck },
];

export function CompanyAdminDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardSummary()
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
        subtitle="Here's what's happening in your organization today."      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tilesFor(summary).map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} tone={tile.tone} />
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

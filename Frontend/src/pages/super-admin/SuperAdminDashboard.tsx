import { useEffect, useState, type ComponentType } from 'react';
import { Building2, Layers, Tag, Users } from 'lucide-react';
import { getPlatformDashboardSummary, type PlatformDashboardSummary } from '../../api/tenancy';
import { StatTile, StatTileSkeleton } from '../../components/ui/StatTile';
import { DashboardHeader } from '../../components/DashboardHeader';
import { QuickActions } from '../../components/QuickActions';
import { useAuth } from '../../context/auth-context';
import { CompanyTrendChart } from './components/CompanyTrendChart';
import { CompanyStatusBreakdown } from './components/CompanyStatusBreakdown';

interface Tile {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: 'soft' | 'filled';
}

function tilesFor(summary: PlatformDashboardSummary): Tile[] {
  return [
    { label: 'Groups', value: summary.groupCount, icon: Layers, tone: 'filled' },
    { label: 'Companies', value: summary.companyCount, icon: Building2, tone: 'soft' },
    { label: 'Brands', value: summary.brandCount, icon: Tag, tone: 'filled' },
    { label: 'Employees', value: summary.employeeCount, icon: Users, tone: 'soft' },
  ];
}

const QUICK_ACTIONS = [
  { label: 'Companies', to: '/super-admin/companies', icon: Building2 },
  { label: 'Users', to: '/super-admin/users', icon: Users },
];

// Platform-wide overview — every Group/Company/Brand/Employee, unscoped
// (GET /dashboard/platform-summary, Super-Admin-only). Mirrors the same
// header + stat-tile-row + chart-row + quick-actions layout every other
// portal's dashboard already uses (CompanyAdminDashboard, GroupAdminDashboard).
export function SuperAdminDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<PlatformDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformDashboardSummary()
      .then(setSummary)
      .catch(() => setError('Could not load dashboard summary.'));
  }, []);

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

  return (
    <div>
      <DashboardHeader
        name={user?.email.split('@')[0] ?? 'Super Admin'}
        subtitle="Platform overview across every Group, Company, and Brand."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tilesFor(summary).map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} icon={tile.icon} tone={tile.tone} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CompanyTrendChart data={summary.companyTrend} />
        </div>
        <CompanyStatusBreakdown breakdown={summary.companyStatusBreakdown} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <QuickActions actions={QUICK_ACTIONS} />
      </div>
    </div>
  );
}

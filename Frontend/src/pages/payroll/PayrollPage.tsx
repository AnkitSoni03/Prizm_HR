import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { getPayrollAccess, getPendingReleaseCount, type PayrollAccess } from '../../api/payroll';
import { MonthlyPayrollTab } from './tabs/MonthlyPayrollTab';
import { SalariesTab } from './tabs/SalariesTab';
import { TemplatesTab } from './tabs/TemplatesTab';
import { DeductionsTab } from './tabs/DeductionsTab';
import { BonusesTab } from './tabs/BonusesTab';
import { ReleasesTab } from './tabs/ReleasesTab';

// Payroll at three levels, one page for every portal: Group (Group Admin,
// Group-level power) → every company; Company (Company Admin, HR Manager,
// Company-level power) → own company + its brands; Brand (Brand Admin,
// Brand-level power) → own brand. The server decides the level and bounds
// every list / change by it (GET /payroll/access); templates and items made
// above the caller's level are usable but read-only (row.canEdit).
export function PayrollPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [access, setAccess] = useState<PayrollAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingReleases, setPendingReleases] = useState(0);

  const refreshReleaseCount = () => {
    getPendingReleaseCount().then(setPendingReleases).catch(() => undefined);
  };

  useEffect(() => {
    getPayrollAccess()
      .then((a) => {
        setAccess(a);
        if (a.canManage) refreshReleaseCount();
      })
      .catch(() => setError('You don’t have access to payroll.'));
  }, []);

  if (error) return <EmptyStateCard icon={Wallet} title="Payroll" description={error} />;
  if (!access) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!access.groupId) {
    return <EmptyStateCard icon={Wallet} title="Payroll" description="Your company isn’t part of a Group yet, so there is no payroll to show." />;
  }

  const items = [
    { key: 'months', label: 'Monthly Payroll' },
    { key: 'salaries', label: 'Employee Salaries' },
    { key: 'templates', label: 'Salary Templates' },
    { key: 'bonuses', label: 'Bonuses' },
    { key: 'deductions', label: 'Allowances & Deductions' },
    ...(access.canManage
      ? [{ key: 'releases', label: pendingReleases > 0 ? `Release Requests (${pendingReleases})` : 'Release Requests' }]
      : []),
  ];
  const requested = searchParams.get('tab');
  const active = items.some((i) => i.key === requested) ? (requested as string) : 'months';

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-page px-3 py-2 text-sm text-ink-muted">
        {!access.canManage
          ? 'View only — you can see payroll but not change it.'
          : access.level === 'group'
            ? 'You manage payroll for every company and brand of the Group.'
            : access.level === 'company'
              ? 'You manage payroll for your company and all its brands. Group templates can be used; only the Group can change them.'
              : 'You manage payroll for your brand. Group and company templates can be used; only they can change them.'}
      </p>
      <Tabs items={items} active={active} onChange={(key) => setSearchParams({ tab: key }, { replace: true })} />
      {active === 'months' && <MonthlyPayrollTab canManage={access.canManage} />}
      {active === 'salaries' && <SalariesTab access={access} />}
      {active === 'templates' && <TemplatesTab access={access} />}
      {active === 'bonuses' && <BonusesTab canManage={access.canManage} />}
      {active === 'deductions' && <DeductionsTab access={access} />}
      {active === 'releases' && <ReleasesTab access={access} onChanged={refreshReleaseCount} />}
    </div>
  );
}

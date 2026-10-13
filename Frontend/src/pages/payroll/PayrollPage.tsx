import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { getPayrollAccess } from '../../api/payroll';
import { MonthlyPayrollTab } from './tabs/MonthlyPayrollTab';
import { SalariesTab } from './tabs/SalariesTab';
import { TemplatesTab } from './tabs/TemplatesTab';
import { DeductionsTab } from './tabs/DeductionsTab';
import { PayslipRequestsTab } from './tabs/PayslipRequestsTab';

// Group-level payroll. One page for every portal: Group Admin and the
// "Manage Payroll" power (ESS) can change things; Company / Brand Admins see
// the same tabs read-only (the server decides — GET /payroll/access).
export function PayrollPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [access, setAccess] = useState<{ canManage: boolean; groupId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPayrollAccess()
      .then(setAccess)
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
    { key: 'deductions', label: 'Extra Deductions' },
    ...(access.canManage ? [{ key: 'requests', label: 'Payslip Requests' }] : []),
  ];
  const requested = searchParams.get('tab');
  const active = items.some((i) => i.key === requested) ? (requested as string) : 'months';

  return (
    <div className="space-y-4">
      {!access.canManage && (
        <p className="rounded-xl bg-page px-3 py-2 text-sm text-ink-muted">
          View only — payroll is managed at Group level by the Group Admin.
        </p>
      )}
      <Tabs items={items} active={active} onChange={(key) => setSearchParams({ tab: key }, { replace: true })} />
      {active === 'months' && <MonthlyPayrollTab canManage={access.canManage} />}
      {active === 'salaries' && <SalariesTab canManage={access.canManage} />}
      {active === 'templates' && <TemplatesTab canManage={access.canManage} />}
      {active === 'deductions' && <DeductionsTab canManage={access.canManage} />}
      {active === 'requests' && access.canManage && <PayslipRequestsTab />}
    </div>
  );
}

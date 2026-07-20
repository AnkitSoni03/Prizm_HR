import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Pagination } from '../../components/ui/Pagination';
import { Badge } from '../../components/ui/Badge';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { PayslipDetailModal } from '../company-admin/components/PayslipDetailModal';
import { listMyPayslips, type Payslip } from '../../api/companyAdmin/payslips';

const LIMIT = 20;

export function MyPayslipsPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewPayslipId, setViewPayslipId] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listMyPayslips({ limit: LIMIT, offset });
      setPayslips(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load your payslips.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  return (
    <div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!isLoading && !error && payslips.length === 0 && (
        <EmptyStateCard
          icon={Wallet}
          title="No payslips yet"
          description="Your payslips will appear here once your company processes a payroll run that includes you."
        />
      )}

      {(isLoading || payslips.length > 0) && (
        <>
          <Table
            isLoading={isLoading}
            rows={payslips}
            rowKey={(p) => p.id}
            columns={[
              {
                key: 'period',
                header: 'Period',
                render: (p) => (p.payrollRun ? `${p.payrollRun.periodMonth}/${p.payrollRun.periodYear}` : '—'),
              },
              {
                key: 'status',
                header: 'Status',
                render: (p) => (
                  <Badge tone={p.payrollRun?.status === 'paid' ? 'success' : 'neutral'}>
                    {p.payrollRun?.status ?? '—'}
                  </Badge>
                ),
              },
              { key: 'payable', header: 'Payable Days', render: (p) => `${p.payableDays} / ${p.workingDays}` },
              { key: 'net', header: 'Net Pay', render: (p) => <span className="font-semibold text-ink">{p.netPay.toLocaleString()}</span> },
              {
                key: 'actions',
                header: '',
                className: 'w-20 text-right',
                render: (p) => (
                  <button
                    type="button"
                    onClick={() => setViewPayslipId(p.id)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    View
                  </button>
                ),
              },
            ]}
          />
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}

      {viewPayslipId && (
        <PayslipDetailModal payslipId={viewPayslipId} own title="My Payslip" onClose={() => setViewPayslipId(null)} />
      )}
    </div>
  );
}

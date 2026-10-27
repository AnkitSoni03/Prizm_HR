import { useEffect, useState } from 'react';
import { Download, Wallet } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useToast } from '../../context/toast-context';
import {
  downloadMyPayslipPdf,
  formatRupees,
  getMyPayroll,
  getMySalary,
  periodLabel,
  saveBlob,
  type EmployeePayroll,
  type MySalary,
} from '../../api/payroll';
import { PayrollMonthView } from '../payroll/components/PayrollMonthView';

// The employee's own salary: only the months a payroll manager has reviewed
// and shared — each with the full payslip (structure + PDF).
export function MySalaryPage() {
  const showToast = useToast();
  const [salary, setSalary] = useState<MySalary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewing, setViewing] = useState<EmployeePayroll | null>(null);

  async function load() {
    setIsLoading(true);
    try {
      setSalary(await getMySalary());
    } catch {
      showToast('Could not load your salary.', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(row: EmployeePayroll) {
    try {
      setViewing(await getMyPayroll(String(row.id)));
    } catch {
      showToast('Could not open this month.', 'error');
    }
  }

  async function download(row: EmployeePayroll) {
    try {
      saveBlob(await downloadMyPayslipPdf(String(row.id)), `payslip-${row.periodYear}-${String(row.periodMonth).padStart(2, '0')}.pdf`);
    } catch {
      showToast('Could not download the payslip.', 'error');
    }
  }

  if (isLoading && !salary) return <p className="text-sm text-ink-muted">Loading…</p>;
  const months = salary?.months ?? [];
  const latest = months[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border px-3 py-2">
          <p className="text-xs text-ink-muted">Your gross salary</p>
          <p className="text-base font-semibold text-ink">
            {salary?.current ? `${formatRupees(salary.current.monthlyGross)} / month` : 'Not set yet'}
          </p>
          {salary?.current?.grossPeriod === 'yearly' && (
            <p className="text-xs text-ink-muted">{formatRupees(salary.current.grossAmount)} / year</p>
          )}
        </div>
        {latest && (
          <>
            <div className="rounded-xl border border-border px-3 py-2">
              <p className="text-xs text-ink-muted">Deductions · {periodLabel(latest.periodYear, latest.periodMonth)}</p>
              <p className="text-base font-semibold text-ink">{formatRupees(latest.totalDeductions)}</p>
            </div>
            <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2">
              <p className="text-xs text-success">Credited · {periodLabel(latest.periodYear, latest.periodMonth)}</p>
              <p className="text-base font-semibold text-success">{formatRupees(latest.netPay)}</p>
            </div>
          </>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Payslips</h2>
        </div>
        {months.length === 0 ? (
          <EmptyStateCard
            icon={Wallet}
            title="No payslips yet"
            description="Your payslip for a month appears here once HR shares it with you. You’ll get a notification."
          />
        ) : (
          <Table
            rows={months}
            rowKey={(r) => String(r.id)}
            columns={[
              {
                key: 'month',
                header: 'Month',
                render: (r) => (
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => open(r)}>
                    {periodLabel(r.periodYear, r.periodMonth)}
                  </button>
                ),
              },
              { key: 'days', header: 'Paid / LOP days', render: (r) => `${r.paidDays} / ${r.lopDays}` },
              { key: 'ded', header: 'Deductions', render: (r) => formatRupees(r.totalDeductions) },
              {
                key: 'bonus',
                header: 'Bonus',
                render: (r) => (Number(r.bonusTotal) > 0 ? <span className="text-success">+{formatRupees(r.bonusTotal)}</span> : '—'),
              },
              { key: 'net', header: 'In-hand', render: (r) => <span className="font-semibold text-ink">{formatRupees(r.netPay)}</span> },
              {
                key: 'slip',
                header: 'Payslip',
                render: (r) => (
                  <button type="button" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => download(r)}>
                    <Download className="h-4 w-4" /> Download
                  </button>
                ),
              },
              { key: 'rev', header: '', render: (r) => (r.revisedAt ? <Badge tone="warning">Revised</Badge> : null) },
            ]}
          />
        )}
      </section>

      {viewing && (
        <Modal
          title={`Salary · ${periodLabel(viewing.periodYear, viewing.periodMonth)}`}
          onClose={() => setViewing(null)}
          widthClassName="max-w-4xl"
          headerActions={
            <Button variant="secondary" onClick={() => download(viewing)}>
              <Download className="mr-1.5 h-4 w-4" /> Payslip
            </Button>
          }
        >
          <PayrollMonthView payroll={viewing} />
        </Modal>
      )}

    </div>
  );
}

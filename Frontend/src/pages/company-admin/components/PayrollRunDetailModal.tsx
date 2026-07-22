import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Table } from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../context/auth-context';
import { useConfirm } from '../../../context/confirm-context';
import {
  cancelPayrollRun,
  getPayrollRunHistory,
  payPayrollRun,
  processPayrollRun,
  type PayrollRun,
  type PayrollRunHistoryEntry,
} from '../../../api/companyAdmin/payrollRuns';
import { listPayslipsForRun, type Payslip } from '../../../api/companyAdmin/payslips';
import { PayslipDetailModal } from './PayslipDetailModal';

interface PayrollRunDetailModalProps {
  run: PayrollRun;
  onClose: () => void;
  onChanged: () => void;
}

const STATUS_TONE: Record<PayrollRun['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'warning',
  processed: 'neutral',
  paid: 'success',
  cancelled: 'danger',
};

export function PayrollRunDetailModal({ run, onClose, onChanged }: PayrollRunDetailModalProps) {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [history, setHistory] = useState<PayrollRunHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewPayslipId, setViewPayslipId] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState(run);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [payslipResult, historyResult] = await Promise.all([
        listPayslipsForRun(currentRun.id, { limit: 100 }),
        getPayrollRunHistory(currentRun.id),
      ]);
      setPayslips(payslipResult.data);
      setHistory(historyResult);
    } catch {
      setError('Could not load this payroll run.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRun.id]);

  async function handleProcess() {
    const confirmed = await confirm({
      title: 'Process payroll run',
      message: `Process payroll for ${currentRun.periodMonth}/${currentRun.periodYear}? Payslips will be generated for every active employee with a salary structure.`,
      confirmLabel: 'Process',
    });
    if (!confirmed) return;
    setIsActing(true);
    setError(null);
    try {
      const updated = await processPayrollRun(currentRun.id);
      setCurrentRun(updated);
      onChanged();
      await load();
    } catch {
      setError('Could not process this payroll run.');
    } finally {
      setIsActing(false);
    }
  }

  async function handlePay() {
    const confirmed = await confirm({
      title: 'Mark as paid',
      message: 'Mark this payroll run as paid? Every employee will be notified.',
      confirmLabel: 'Mark as Paid',
    });
    if (!confirmed) return;
    setIsActing(true);
    setError(null);
    try {
      const updated = await payPayrollRun(currentRun.id);
      setCurrentRun(updated);
      onChanged();
      await load();
    } catch {
      setError('Could not mark this payroll run as paid.');
    } finally {
      setIsActing(false);
    }
  }

  async function handleCancel() {
    const confirmed = await confirm({
      title: 'Cancel payroll run',
      message: 'Cancel this draft payroll run?',
      confirmLabel: 'Cancel Run',
      variant: 'danger',
    });
    if (!confirmed) return;
    setIsActing(true);
    setError(null);
    try {
      const updated = await cancelPayrollRun(currentRun.id);
      setCurrentRun(updated);
      onChanged();
    } catch {
      setError('Could not cancel this payroll run.');
    } finally {
      setIsActing(false);
    }
  }

  return (
    <Modal
      title={`Payroll Run — ${currentRun.periodMonth}/${currentRun.periodYear}`}
      onClose={onClose}
      widthClassName="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[currentRun.status]}>{currentRun.status}</Badge>
            <span className="text-xs text-ink-muted">
              {currentRun.payPeriodStart} → {currentRun.payPeriodEnd}
            </span>
          </div>
          <div className="flex gap-2">
            {currentRun.status === 'draft' && hasPermission('payroll_run:cancel') && (
              <Button variant="secondary" onClick={handleCancel} isLoading={isActing}>
                Cancel Run
              </Button>
            )}
            {currentRun.status === 'draft' && hasPermission('payroll_run:process') && (
              <Button onClick={handleProcess} isLoading={isActing}>
                Process Run
              </Button>
            )}
            {currentRun.status === 'processed' && hasPermission('payroll_run:pay') && (
              <Button onClick={handlePay} isLoading={isActing}>
                Mark as Paid
              </Button>
            )}
          </div>
        </div>

        {currentRun.status !== 'draft' && (
          <div
            className={`grid gap-2 rounded-xl border border-border bg-page px-3 py-2.5 text-center text-sm ${
              currentRun.totalEmployerContributions ? 'grid-cols-4' : 'grid-cols-3'
            }`}
          >
            <div>
              <p className="text-xs text-ink-muted">Gross</p>
              <p className="font-semibold text-ink">{(currentRun.totalGross ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Deductions</p>
              <p className="font-semibold text-ink">{(currentRun.totalDeductions ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Net</p>
              <p className="font-semibold text-ink">{(currentRun.totalNet ?? 0).toLocaleString()}</p>
            </div>
            {!!currentRun.totalEmployerContributions && (
              <div>
                <p className="text-xs text-ink-muted">Employer Contributions</p>
                <p className="font-semibold text-ink">{currentRun.totalEmployerContributions.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <Table
          isLoading={isLoading}
          rows={payslips}
          rowKey={(p) => p.id}
          emptyMessage={currentRun.status === 'draft' ? 'No payslips yet — process this run to generate them.' : 'No payslips found.'}
          columns={[
            { key: 'employee', header: 'Employee', render: (p) => p.employee?.name ?? p.employee?.employeeCode ?? p.employeeId },
            { key: 'payable', header: 'Payable Days', render: (p) => `${p.payableDays} / ${p.workingDays}` },
            { key: 'gross', header: 'Gross', render: (p) => p.grossEarnings.toLocaleString() },
            { key: 'deductions', header: 'Deductions', render: (p) => p.totalDeductions.toLocaleString() },
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

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">History</p>
          {isLoading && <Skeleton className="h-10 w-full" />}
          {!isLoading && history.length === 0 && <p className="text-sm text-ink-muted">No decisions recorded yet.</p>}
          {!isLoading &&
            history.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0">
                <span className="text-ink">
                  <Badge tone={entry.action === 'paid' ? 'success' : 'neutral'}>{entry.action}</Badge>{' '}
                  by {entry.actorUser?.employee?.name || entry.actorUser?.email || '—'}
                </span>
                <span className="text-xs text-ink-muted">{new Date(entry.decidedAt).toLocaleString()}</span>
              </div>
            ))}
        </div>
      </div>

      {viewPayslipId && <PayslipDetailModal payslipId={viewPayslipId} onClose={() => setViewPayslipId(null)} />}
    </Modal>
  );
}

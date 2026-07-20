import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Badge } from '../../../components/ui/Badge';
import { getPayslip, getMyPayslip, type Payslip } from '../../../api/companyAdmin/payslips';

interface PayslipDetailModalProps {
  payslipId: string;
  // ESS reads its own payslip via /payroll/payslips/mine/:id
  // (payslip:read_own); Company Admin reads any via /payroll/payslips/:id
  // (payslip:read). Same modal, different fetch.
  own?: boolean;
  title?: string;
  onClose: () => void;
}

export function PayslipDetailModal({ payslipId, own, title = 'Payslip', onClose }: PayslipDetailModalProps) {
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    (own ? getMyPayslip(payslipId) : getPayslip(payslipId))
      .then((result) => {
        if (!cancelled) setPayslip(result);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this payslip.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payslipId]);

  const earnings = payslip?.components?.filter((c) => c.category === 'earning' || c.category === 'reimbursement') ?? [];
  const deductions = payslip?.components?.filter((c) => c.category === 'deduction') ?? [];

  return (
    <Modal title={title} onClose={onClose} widthClassName="max-w-lg">
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {!isLoading && error && <p className="text-sm text-danger">{error}</p>}
      {!isLoading && !error && payslip && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-muted">
              {payslip.payrollRun ? `${payslip.payrollRun.periodMonth}/${payslip.payrollRun.periodYear}` : '—'}
            </p>
            {payslip.payrollRun && (
              <Badge tone={payslip.payrollRun.status === 'paid' ? 'success' : 'neutral'}>{payslip.payrollRun.status}</Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-page px-3 py-2.5 text-center text-sm">
            <div>
              <p className="text-xs text-ink-muted">Working Days</p>
              <p className="font-semibold text-ink">{payslip.workingDays}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">LOP Days</p>
              <p className="font-semibold text-ink">{payslip.lopDays}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Payable Days</p>
              <p className="font-semibold text-ink">{payslip.payableDays}</p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Earnings</p>
            <div className="space-y-1">
              {earnings.map((c) => (
                <div key={c.id} className="flex justify-between text-sm">
                  <span className="text-ink">{c.name}</span>
                  <span className="text-ink">{c.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
                <span className="text-ink">Gross Earnings</span>
                <span className="text-ink">{payslip.grossEarnings.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {deductions.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Deductions</p>
              <div className="space-y-1">
                {deductions.map((c) => (
                  <div key={c.id} className="flex justify-between text-sm">
                    <span className="text-ink">{c.name}</span>
                    <span className="text-ink">−{c.amount.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
                  <span className="text-ink">Total Deductions</span>
                  <span className="text-ink">−{payslip.totalDeductions.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between rounded-xl bg-primary-light px-3 py-2.5 text-base font-bold text-primary">
            <span>Net Pay</span>
            <span>{payslip.netPay.toLocaleString()}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

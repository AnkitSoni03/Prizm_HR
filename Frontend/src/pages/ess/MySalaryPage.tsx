import { useEffect, useState } from 'react';
import { Download, FileText, Wallet } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useToast } from '../../context/toast-context';
import { useConfirm } from '../../context/confirm-context';
import { apiErrorMessage } from '../../utils/apiError';
import {
  cancelMyPayslipRequest,
  downloadMyPayslipPdf,
  formatRupees,
  getMyPayroll,
  getMySalary,
  listMyPayslipRequests,
  periodLabel,
  requestPayslips,
  saveBlob,
  type EmployeePayroll,
  type MySalary,
  type PayslipRequest,
} from '../../api/payroll';
import { PayrollMonthView } from '../payroll/components/PayrollMonthView';

const TONE = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' } as const;

// The employee's own salary: each completed month's deductions and in-hand
// (the running month appears only after it ends). The full payslip — whole
// structure + PDF — needs a request that a payroll manager approves.
export function MySalaryPage() {
  const showToast = useToast();
  const confirm = useConfirm();
  const [salary, setSalary] = useState<MySalary | null>(null);
  const [requests, setRequests] = useState<PayslipRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewing, setViewing] = useState<EmployeePayroll | null>(null);
  const [requesting, setRequesting] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const [s, r] = await Promise.all([getMySalary(), listMyPayslipRequests()]);
      setSalary(s);
      setRequests(r);
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

  async function cancel(request: PayslipRequest) {
    const ok = await confirm({ title: 'Cancel request', message: 'Cancel this payslip request?', confirmLabel: 'Cancel request', variant: 'danger' });
    if (!ok) return;
    try {
      await cancelMyPayslipRequest(String(request.id));
      load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not cancel.'), 'error');
    }
  }

  if (isLoading && !salary) return <p className="text-sm text-ink-muted">Loading…</p>;
  const months = salary?.months ?? [];
  const latest = months[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border px-3 py-2">
          <p className="text-xs text-ink-muted">Your CTC</p>
          <p className="text-base font-semibold text-ink">
            {salary?.current ? `${formatRupees(salary.current.monthlyCtc)} / month` : 'Not set yet'}
          </p>
          {salary?.current?.ctcPeriod === 'yearly' && (
            <p className="text-xs text-ink-muted">{formatRupees(salary.current.ctcAmount)} / year</p>
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
          <h2 className="text-sm font-semibold text-ink">Monthly salary</h2>
          {months.length > 0 && (
            <Button variant="secondary" onClick={() => setRequesting(true)}>
              <FileText className="mr-1.5 h-4 w-4" /> Request payslip
            </Button>
          )}
        </div>
        {months.length === 0 ? (
          <EmptyStateCard
            icon={Wallet}
            title="No salary months yet"
            description="A month’s salary shows up here after the month is over (e.g. October appears from 1 November)."
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
                render: (r) =>
                  r.payslipReleased ? (
                    <button type="button" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => download(r)}>
                      <Download className="h-4 w-4" /> Download
                    </button>
                  ) : (
                    <span className="text-xs text-ink-muted">Request to get it</span>
                  ),
              },
              { key: 'rev', header: '', render: (r) => (r.revisedAt ? <Badge tone="warning">Revised</Badge> : null) },
            ]}
          />
        )}
      </section>

      {requests.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Payslip requests</h2>
          <Table
            rows={requests}
            rowKey={(r) => String(r.id)}
            columns={[
              { key: 'months', header: 'Months', render: (r) => r.periods.map((p) => periodLabel(p.year, p.month)).join(', ') },
              { key: 'on', header: 'Requested', render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN') },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <div>
                    <Badge tone={TONE[r.status]}>{r.status}</Badge>
                    {r.rejectionReason && <p className="mt-1 text-xs text-ink-muted">{r.rejectionReason}</p>}
                  </div>
                ),
              },
              {
                key: 'actions',
                header: '',
                render: (r) =>
                  r.status === 'pending' ? (
                    <button type="button" className="text-sm text-danger hover:underline" onClick={() => cancel(r)}>
                      Cancel
                    </button>
                  ) : null,
              },
            ]}
          />
        </section>
      )}

      {viewing && (
        <Modal
          title={`Salary · ${periodLabel(viewing.periodYear, viewing.periodMonth)}`}
          onClose={() => setViewing(null)}
          widthClassName="max-w-4xl"
          headerActions={
            viewing.payslipReleased ? (
              <Button variant="secondary" onClick={() => download(viewing)}>
                <Download className="mr-1.5 h-4 w-4" /> Payslip
              </Button>
            ) : undefined
          }
        >
          <PayrollMonthView payroll={viewing} />
          {!viewing.payslipReleased && (
            <p className="mt-3 text-sm text-ink-muted">Want the full salary structure and a PDF payslip? Use “Request payslip”.</p>
          )}
        </Modal>
      )}

      {requesting && (
        <RequestPayslipModal
          months={months}
          pendingKeys={new Set(requests.filter((r) => r.status === 'pending').flatMap((r) => r.periods.map((p) => `${p.year}-${p.month}`)))}
          onClose={() => setRequesting(false)}
          onSent={() => {
            setRequesting(false);
            showToast('Request sent. You’ll be notified when your payslip is ready.', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

function RequestPayslipModal({
  months,
  pendingKeys,
  onClose,
  onSent,
}: {
  months: EmployeePayroll[];
  pendingKeys: Set<string>;
  onClose: () => void;
  onSent: () => void;
}) {
  const available = months.filter((m) => !m.payslipReleased && !pendingKeys.has(`${m.periodYear}-${m.periodMonth}`));
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSend() {
    if (selected.length === 0) return setError('Choose at least one month.');
    setIsSaving(true);
    setError(null);
    try {
      await requestPayslips(
        selected.map((k) => {
          const [year, month] = k.split('-').map(Number);
          return { year, month };
        }),
        note.trim() || undefined
      );
      onSent();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send the request.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="Request payslip" onClose={onClose}>
      <div className="space-y-3">
        {available.length === 0 ? (
          <p className="text-sm text-ink-muted">Every month is already available or requested.</p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {available.map((m) => {
              const key = `${m.periodYear}-${m.periodMonth}`;
              const checked = selected.includes(key);
              return (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelected((s) => (checked ? s.filter((x) => x !== key) : [...s, key]))}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                  />
                  <span className="flex-1 text-ink">{periodLabel(m.periodYear, m.periodMonth)}</span>
                  <span className="text-ink-muted">{formatRupees(m.netPay)}</span>
                </label>
              );
            })}
          </div>
        )}
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. needed for a loan" />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} isLoading={isSaving} disabled={available.length === 0}>Send request</Button>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Table } from '../../../components/ui/Table';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../context/toast-context';
import { apiErrorMessage } from '../../../utils/apiError';
import {
  downloadPayrollPdf,
  formatRupees,
  generatePayrollMonth,
  getPayroll,
  listPayrolls,
  MONTH_NAMES,
  periodLabel,
  recalculatePayroll,
  saveBlob,
  orgLabel,
  type EmployeePayroll,
} from '../../../api/payroll';
import { PayrollFilters, type PayrollFilterValue } from '../components/PayrollFilters';
import { PayrollMonthView } from '../components/PayrollMonthView';

const LIMIT = 50;

function lastMonth() {
  const now = new Date();
  return now.getMonth() === 0 ? { year: now.getFullYear() - 1, month: 12 } : { year: now.getFullYear(), month: now.getMonth() };
}

export function MonthlyPayrollTab({ canManage }: { canManage: boolean }) {
  const showToast = useToast();
  const [period, setPeriod] = useState(lastMonth());
  const [filters, setFilters] = useState<PayrollFilterValue>({ companyId: '', brandId: '', search: '' });
  const [rows, setRows] = useState<EmployeePayroll[]>([]);
  const [totals, setTotals] = useState({ gross: 0, deductions: 0, employer: 0, net: 0 });
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EmployeePayroll | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listPayrolls({
        year: period.year,
        month: period.month,
        companyId: filters.companyId || undefined,
        brandId: filters.brandId || undefined,
        search: filters.search || undefined,
        limit: LIMIT,
        offset,
      });
      setRows(result.data);
      setTotals(result.totals);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load payroll.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, filters, offset]);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const result = await generatePayrollMonth(period.year, period.month);
      showToast(
        result.created > 0
          ? `Generated payroll for ${result.created} employee(s).`
          : 'Payroll is up to date for this month.',
        'success'
      );
      await load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not generate payroll.'), 'error');
    } finally {
      setIsGenerating(false);
    }
  }

  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-36">
          <Select
            label="Month"
            value={String(period.month)}
            onChange={(e) => {
              setOffset(0);
              setPeriod({ ...period, month: Number(e.target.value) });
            }}
            options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
        </div>
        <div className="w-28">
          <Select
            label="Year"
            value={String(period.year)}
            onChange={(e) => {
              setOffset(0);
              setPeriod({ ...period, year: Number(e.target.value) });
            }}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
        {canManage && (
          <Button variant="secondary" onClick={handleGenerate} isLoading={isGenerating}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Generate / refresh
          </Button>
        )}
      </div>
      <PayrollFilters
        value={filters}
        onChange={(v) => {
          setOffset(0);
          setFilters(v);
        }}
      />
      <p className="text-xs text-ink-muted">
        A month&apos;s payroll is generated automatically on the 1st of the next month, and recalculated by itself if leave or
        attendance for it changes later.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Gross" value={formatRupees(totals.gross)} />
        <Tile label="Deductions" value={formatRupees(totals.deductions)} />
        <Tile label="Employer share" value={formatRupees(totals.employer)} />
        <Tile label="In-hand total" value={formatRupees(totals.net)} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <Table
        isLoading={isLoading}
        rows={rows}
        rowKey={(r) => String(r.id)}
        emptyMessage={`No payroll for ${periodLabel(period.year, period.month)} yet.`}
        columns={[
          {
            key: 'employee',
            header: 'Employee',
            render: (r) => (
              <button type="button" className="text-left" onClick={() => setSelected(r)}>
                <p className="font-medium text-primary hover:underline">
                  {r.employee?.name ?? '—'} {r.employee?.employeeCode ? `(${r.employee.employeeCode})` : ''}
                </p>
                <p className="text-xs text-ink-muted">{orgLabel(r.employee)}</p>
              </button>
            ),
          },
          { key: 'days', header: 'Paid / LOP days', render: (r) => `${r.paidDays} / ${r.lopDays}` },
          { key: 'ctc', header: 'CTC', render: (r) => formatRupees(r.monthlyCtc) },
          { key: 'gross', header: 'Gross', render: (r) => formatRupees(r.grossEarned) },
          { key: 'ded', header: 'Deductions', render: (r) => formatRupees(r.totalDeductions) },
          {
            key: 'net',
            header: 'In-hand',
            render: (r) => (
              <div>
                <p className="font-semibold text-ink">{formatRupees(r.netPay)}</p>
                {r.carryAdjustment !== 0 && (
                  <p className="text-xs text-ink-muted">incl. {r.carryAdjustment > 0 ? '+' : '−'}{formatRupees(Math.abs(r.carryAdjustment))} adj.</p>
                )}
              </div>
            ),
          },
          {
            key: 'status',
            header: '',
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                {r.revisedAt && <Badge tone="warning">Revised</Badge>}
                {r.payslipReleased && <Badge tone="success">Payslip given</Badge>}
              </div>
            ),
          },
        ]}
      />
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {selected && (
        <PayrollDetailModal
          payrollId={String(selected.id)}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-base font-semibold text-ink">{value}</p>
    </div>
  );
}

export function PayrollDetailModal({
  payrollId,
  canManage,
  onClose,
  onChanged,
}: {
  payrollId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const showToast = useToast();
  const [payroll, setPayroll] = useState<EmployeePayroll | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'recalc' | null>(null);

  useEffect(() => {
    getPayroll(payrollId).then(setPayroll).catch(() => showToast('Could not load this payroll.', 'error'));
  }, [payrollId, showToast]);

  async function handleRecalculate() {
    setBusy('recalc');
    try {
      setPayroll(await recalculatePayroll(payrollId));
      showToast('Recalculated.', 'success');
      onChanged();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not recalculate.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function handlePdf() {
    if (!payroll) return;
    setBusy('pdf');
    try {
      const blob = await downloadPayrollPdf(payrollId);
      saveBlob(blob, `payslip-${payroll.employee?.employeeCode ?? payroll.employee?.name ?? 'employee'}-${payroll.periodYear}-${payroll.periodMonth}.pdf`);
    } catch {
      showToast('Could not download the payslip.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const title = payroll
    ? `${payroll.employee?.name ?? 'Employee'} · ${periodLabel(payroll.periodYear, payroll.periodMonth)}`
    : 'Payroll';

  return (
    <Modal
      title={title}
      onClose={onClose}
      widthClassName="max-w-4xl"
      headerActions={
        payroll && (
          <div className="flex gap-2">
            {canManage && (
              <Button variant="secondary" onClick={handleRecalculate} isLoading={busy === 'recalc'}>
                <RefreshCw className="mr-1.5 h-4 w-4" /> Recalculate
              </Button>
            )}
            <Button variant="secondary" onClick={handlePdf} isLoading={busy === 'pdf'}>
              <Download className="mr-1.5 h-4 w-4" /> Payslip
            </Button>
          </div>
        )
      }
    >
      {!payroll ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            {orgLabel(payroll.employee)} · Template: {payroll.details.templateName ?? '—'}
            {payroll.details.deductionsEnabled === false ? ' · Deductions off' : ''}
          </p>
          <PayrollMonthView payroll={payroll} />
        </div>
      )}
    </Modal>
  );
}

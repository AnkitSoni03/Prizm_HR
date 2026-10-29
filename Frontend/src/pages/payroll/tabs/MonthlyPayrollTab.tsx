import { useEffect, useState } from 'react';
import { Download, EyeOff, Lock, LockOpen, RefreshCw, Send } from 'lucide-react';
import { Table } from '../../../components/ui/Table';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../context/toast-context';
import { useConfirm } from '../../../context/confirm-context';
import { apiErrorMessage } from '../../../utils/apiError';
import {
  downloadPayrollPdf,
  formatRupees,
  generatePayrollMonth,
  getPayroll,
  listPayrolls,
  lockPayrolls,
  MONTH_NAMES,
  periodLabel,
  recalculatePayroll,
  saveBlob,
  sharePayrolls,
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
  const confirm = useConfirm();
  const [period, setPeriod] = useState(lastMonth());
  const [filters, setFilters] = useState<PayrollFilterValue>({ companyId: '', brandId: '', search: '' });
  const [rows, setRows] = useState<EmployeePayroll[]>([]);
  const [totals, setTotals] = useState({ gross: 0, deductions: 0, employer: 0, bonus: 0, net: 0 });
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EmployeePayroll | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<'all' | 'selected' | 'unshare' | null>(null);
  const [locking, setLocking] = useState<'all' | 'selected' | 'unlock' | null>(null);

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
      setChecked(new Set());
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
      const refreshed = result.refreshed ?? 0;
      showToast(
        result.created > 0
          ? `Generated payroll for ${result.created} employee(s)${refreshed > 0 ? `, refreshed ${refreshed} not-locked month(s)` : ''}.`
          : refreshed > 0
            ? `Refreshed ${refreshed} not-locked month(s) with the latest attendance, leave, holidays and roster.`
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

  // Employees see a month only after it is shared here — after review.
  async function handleShare(mode: 'all' | 'selected' | 'unshare') {
    const label = periodLabel(period.year, period.month);
    const ids = [...checked];
    const ok = await confirm(
      mode === 'all'
        ? {
          title: 'Share payslips',
          message: `Share ${label} payslips with every employee in this list${filters.companyId || filters.brandId ? ' (current company / brand filter)' : ''}? They will be notified and can view and download them.`,
          confirmLabel: 'Share with all',
        }
        : mode === 'selected'
          ? { title: 'Share payslips', message: `Share ${label} payslips with ${ids.length} selected employee(s)?`, confirmLabel: 'Share' }
          : {
            title: 'Stop sharing',
            message: `Hide ${label} payslips from ${ids.length} selected employee(s)? They will no longer see this month.`,
            confirmLabel: 'Stop sharing',
            variant: 'danger',
          }
    );
    if (!ok) return;
    setSharing(mode);
    try {
      const result = await sharePayrolls(
        mode === 'all'
          ? { year: period.year, month: period.month, companyId: filters.companyId || undefined, brandId: filters.brandId || undefined, share: true }
          : { ids, share: mode === 'selected' }
      );
      showToast(
        result.updated === 0
          ? 'Nothing to change — already done.'
          : mode === 'unshare'
            ? `Stopped sharing with ${result.updated} employee(s).`
            : `Shared with ${result.updated} employee(s).`,
        'success'
      );
      await load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not update sharing.'), 'error');
    } finally {
      setSharing(null);
    }
  }

  // Lock once the salary is paid: later leave / attendance changes then go
  // to arrears in the next month instead of changing this one.
  async function handleLock(mode: 'all' | 'selected' | 'unlock') {
    const label = periodLabel(period.year, period.month);
    const ids = [...checked];
    const ok = await confirm(
      mode === 'all'
        ? {
          title: 'Lock payroll',
          message: `Mark ${label} as paid for every employee in this list${filters.companyId || filters.brandId ? ' (current company / brand filter)' : ''}? Any later change to this month will be paid or recovered in the next month's salary.`,
          confirmLabel: 'Lock all',
        }
        : mode === 'selected'
          ? { title: 'Lock payroll', message: `Mark ${label} as paid for ${ids.length} selected employee(s)? Later changes will go to the next month.`, confirmLabel: 'Lock' }
          : {
            title: 'Unlock payroll',
            message: `Unlock ${label} for ${ids.length} selected employee(s)? Only do this if the salary hasn't been paid — changes waiting for the next month go back into this month.`,
            confirmLabel: 'Unlock',
            variant: 'danger',
          }
    );
    if (!ok) return;
    setLocking(mode);
    try {
      const result = await lockPayrolls(
        mode === 'all'
          ? { year: period.year, month: period.month, companyId: filters.companyId || undefined, brandId: filters.brandId || undefined, lock: true }
          : { ids, lock: mode === 'selected' }
      );
      showToast(
        result.updated === 0
          ? 'Nothing to change — already done.'
          : mode === 'unlock'
            ? `Unlocked ${result.updated} payroll(s).`
            : `Locked ${result.updated} payroll(s).`,
        'success'
      );
      await load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not update the lock.'), 'error');
    } finally {
      setLocking(null);
    }
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allOnPageChecked = rows.length > 0 && rows.every((r) => checked.has(String(r.id)));
  const checkedRows = rows.filter((r) => checked.has(String(r.id)));
  const anyCheckedUnshared = checkedRows.some((r) => !r.payslipReleased);
  const anyCheckedShared = checkedRows.some((r) => r.payslipReleased);
  const anyCheckedUnlocked = checkedRows.some((r) => !r.lockedAt);
  const anyCheckedLocked = checkedRows.some((r) => r.lockedAt);

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
        {canManage && rows.length > 0 && (
          <Button onClick={() => handleShare('all')} isLoading={sharing === 'all'}>
            <Send className="mr-1.5 h-4 w-4" /> Share with all
          </Button>
        )}
        {canManage && rows.length > 0 && (
          <Button variant="secondary" onClick={() => handleLock('all')} isLoading={locking === 'all'}>
            <Lock className="mr-1.5 h-4 w-4" /> Lock all (paid)
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
        A month&apos;s payroll is generated automatically on the 1st of the next month (a salary ended mid-month is settled right
        away, up to its last date), and recalculated by itself if leave or attendance for it changes later. Employees see it only after you review it and share it.
        Lock a month once its salary is paid — until then changes update the month itself (it is refreshed every night, and again when you lock it); after that they are paid or recovered in the next month.
      </p>

      {canManage && checked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary-light px-3 py-2">
          <span className="text-sm font-medium text-primary">{checked.size} selected</span>
          <Button onClick={() => handleShare('selected')} isLoading={sharing === 'selected'} disabled={!anyCheckedUnshared}>
            <Send className="mr-1.5 h-4 w-4" /> Share
          </Button>
          <Button variant="secondary" onClick={() => handleShare('unshare')} isLoading={sharing === 'unshare'} disabled={!anyCheckedShared}>
            <EyeOff className="mr-1.5 h-4 w-4" /> Stop sharing
          </Button>
          <Button variant="secondary" onClick={() => handleLock('selected')} isLoading={locking === 'selected'} disabled={!anyCheckedUnlocked}>
            <Lock className="mr-1.5 h-4 w-4" /> Lock
          </Button>
          <Button variant="secondary" onClick={() => handleLock('unlock')} isLoading={locking === 'unlock'} disabled={!anyCheckedLocked}>
            <LockOpen className="mr-1.5 h-4 w-4" /> Unlock
          </Button>
          <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => setChecked(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label="Gross" value={formatRupees(totals.gross)} />
        <Tile label="Bonuses" value={formatRupees(totals.bonus)} />
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
          ...(canManage
            ? [
              {
                key: 'pick',
                header: '',
                render: (r: EmployeePayroll) => (
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.employee?.name ?? 'employee'}`}
                    checked={checked.has(String(r.id))}
                    onChange={() => toggle(String(r.id))}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                  />
                ),
              },
            ]
            : []),
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
          { key: 'monthlyGross', header: 'Monthly gross', render: (r) => formatRupees(r.monthlyGross) },
          { key: 'gross', header: 'Gross', render: (r) => formatRupees(r.grossEarned) },
          { key: 'bonus', header: 'Bonus', render: (r) => (Number(r.bonusTotal) > 0 ? <span className="text-success">+{formatRupees(r.bonusTotal)}</span> : '—') },
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
                {r.isFinal && <Badge tone="danger" title="Salary ends this month — paid up to the last date">Final · till {r.finalDate}</Badge>}
                {r.isFinal && Math.abs(Number(r.pendingDues ?? 0)) >= 0.01 && (
                  <Badge
                    tone="warning"
                    title="Arrears / recoveries that came after this final settlement was locked — unlock it to settle them in it"
                  >
                    Dues {Number(r.pendingDues) > 0 ? '+' : '−'}{formatRupees(Math.abs(Number(r.pendingDues)))}
                  </Badge>
                )}
                {(r.details?.warnings?.length ?? 0) > 0 && (
                  <Badge tone="warning" title={r.details.warnings!.join('\n')}>Check</Badge>
                )}
                {r.revisedAt && <Badge tone="warning">Revised</Badge>}
                {r.payslipReleased ? <Badge tone="success">Shared</Badge> : <Badge tone="neutral">Not shared</Badge>}
                {r.lockedAt ? (
                  <Badge tone="neutral" title="Salary paid — later changes go to the next month">Locked</Badge>
                ) : (
                  <Badge tone="warning" title="Not paid yet — changes update this month">Not locked</Badge>
                )}
              </div>
            ),
          },
        ]}
      />
      {canManage && rows.length > 0 && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={allOnPageChecked}
            onChange={() => setChecked(allOnPageChecked ? new Set() : new Set(rows.map((r) => String(r.id))))}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
          />
          Select all on this page
        </label>
      )}
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
  const [busy, setBusy] = useState<'pdf' | 'recalc' | 'share' | 'lock' | null>(null);

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

  async function handleShareToggle() {
    if (!payroll) return;
    const share = !payroll.payslipReleased;
    setBusy('share');
    try {
      await sharePayrolls({ ids: [payrollId], share });
      setPayroll({ ...payroll, payslipReleased: share });
      showToast(share ? 'Shared with the employee.' : 'No longer shared.', 'success');
      onChanged();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not update sharing.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function handleLockToggle() {
    if (!payroll) return;
    const lock = !payroll.lockedAt;
    setBusy('lock');
    try {
      await lockPayrolls({ ids: [payrollId], lock });
      // Unlocking folds waiting arrears back into the month — reload it.
      setPayroll(await getPayroll(payrollId));
      showToast(lock ? 'Locked — later changes go to the next month.' : 'Unlocked — changes update this month again.', 'success');
      onChanged();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not update the lock.'), 'error');
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
              <Button variant={payroll.payslipReleased ? 'secondary' : 'primary'} onClick={handleShareToggle} isLoading={busy === 'share'}>
                {payroll.payslipReleased ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Send className="mr-1.5 h-4 w-4" />}
                {payroll.payslipReleased ? 'Stop sharing' : 'Share with employee'}
              </Button>
            )}
            {canManage && (
              <Button variant="secondary" onClick={handleLockToggle} isLoading={busy === 'lock'}>
                {payroll.lockedAt ? <LockOpen className="mr-1.5 h-4 w-4" /> : <Lock className="mr-1.5 h-4 w-4" />}
                {payroll.lockedAt ? 'Unlock' : 'Lock (paid)'}
              </Button>
            )}
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
            {payroll.isFinal && <span className="font-medium text-danger">Final settlement — paid up to {payroll.finalDate} · </span>}
            {orgLabel(payroll.employee)} · Template: {payroll.details.templateName ?? '—'}
            {payroll.details.deductionsEnabled === false ? ' · Deductions off' : ''}
          </p>
          <PayrollMonthView payroll={payroll} />
        </div>
      )}
    </Modal>
  );
}

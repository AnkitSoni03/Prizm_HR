import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../../components/ui/Table';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Toggle } from '../../../components/ui/Toggle';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import { apiErrorMessage } from '../../../utils/apiError';
import {
  BONUS_TYPES,
  bonusTypeLabel,
  createBonus,
  deleteBonus,
  formatRupees,
  listBonuses,
  MONTH_NAMES,
  orgLabel,
  periodLabel,
  updateBonus,
  type BonusType,
  type GroupEmployee,
  type PayrollBonus,
  type SkippedBonus,
} from '../../../api/payroll';
import { PayrollFilters, type PayrollFilterValue } from '../components/PayrollFilters';
import { EmployeeMultiPicker } from '../components/EmployeeMultiPicker';
import { MonthMultiPicker } from '../components/MonthMultiPicker';

const LIMIT = 50;
const BASIS_LABEL = { basic: 'Basic', gross: 'Gross' } as const;

function yearOptions() {
  const y = new Date().getFullYear();
  return [y + 1, y, y - 1, y - 2].map((v) => ({ value: String(v), label: String(v) }));
}

// One-time extra pay (bonus, incentive, overtime, reimbursement…) for one
// employee in one month. Paid on top of the salary — outside gross, not cut for
// loss-of-pay days, no PF/ESI/PT. Adding one to a month whose payroll is
// already generated recalculates that month; the difference reaches the next
// salary as arrears.
export function BonusesTab({ canManage }: { canManage: boolean }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [filters, setFilters] = useState<PayrollFilterValue>({ companyId: '', brandId: '', search: '' });
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState('');
  const [type, setType] = useState('');
  const [rows, setRows] = useState<PayrollBonus[]>([]);
  const [sum, setSum] = useState(0);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PayrollBonus | 'new' | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listBonuses({
        year: year ? Number(year) : undefined,
        month: month ? Number(month) : undefined,
        type: type || undefined,
        companyId: filters.companyId || undefined,
        brandId: filters.brandId || undefined,
        search: filters.search || undefined,
        limit: LIMIT,
        offset,
      });
      setRows(result.data);
      setSum(result.total);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load bonuses.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, year, month, type, offset]);

  async function handleDelete(bonus: PayrollBonus) {
    const ok = await confirm({
      title: 'Delete',
      message: `Delete ${bonusTypeLabel(bonus.type).toLowerCase()} of ${formatRupees(bonus.amount)} for ${bonus.employee?.name ?? 'this employee'} (${periodLabel(bonus.periodYear, bonus.periodMonth)})? If that month's payroll is already made, it is recalculated and the amount is recovered from the next salary.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteBonus(String(bonus.id));
      showToast('Deleted.', 'success');
      load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not delete.'), 'error');
    }
  }

  const resetOffset = <T,>(set: (v: T) => void) => (v: T) => {
    setOffset(0);
    set(v);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-36">
            <Select
              label="Month"
              value={month}
              onChange={(e) => resetOffset(setMonth)(e.target.value)}
              placeholder="All months"
              options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </div>
          <div className="w-28">
            <Select label="Year" value={year} onChange={(e) => resetOffset(setYear)(e.target.value)} options={yearOptions()} />
          </div>
          <div className="w-40">
            <Select
              label="Type"
              value={type}
              onChange={(e) => resetOffset(setType)(e.target.value)}
              placeholder="All types"
              options={BONUS_TYPES.map((t) => ({ value: t.key, label: t.label }))}
            />
          </div>
        </div>
        {canManage && (
          <Button onClick={() => setOpen('new')}>
            <Plus className="mr-1.5 h-4 w-4" /> Add bonus
          </Button>
        )}
      </div>
      <PayrollFilters value={filters} onChange={resetOffset(setFilters)} />
      <p className="text-xs text-ink-muted">
        Paid on top of the salary in the chosen month — not part of gross, not cut for loss-of-pay days, no PF / ESI / PT. Taxable
        ones count for TDS. For a month whose payroll is already made, the amount is added through a recalculation and reaches
        the next salary as arrears.
      </p>

      <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
        <span className="text-ink-muted">Total for this filter</span>
        <span className="font-semibold text-ink">{formatRupees(sum)}</span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <Table
        isLoading={isLoading}
        rows={rows}
        rowKey={(r) => String(r.id)}
        emptyMessage="No bonuses for this filter."
        columns={[
          {
            key: 'employee',
            header: 'Employee',
            render: (r) => (
              <div>
                <p className="font-medium text-ink">
                  {r.employee?.name ?? '—'} {r.employee?.employeeCode ? `(${r.employee.employeeCode})` : ''}
                </p>
                <p className="text-xs text-ink-muted">{orgLabel(r.employee)}</p>
              </div>
            ),
          },
          { key: 'month', header: 'Paid in', render: (r) => periodLabel(r.periodYear, r.periodMonth) },
          {
            key: 'type',
            header: 'Type',
            render: (r) => (
              <div>
                <p className="text-ink">{bonusTypeLabel(r.type)}</p>
                {r.title && <p className="text-xs text-ink-muted">{r.title}</p>}
              </div>
            ),
          },
          {
            key: 'amount',
            header: 'Amount',
            render: (r) => (
              <div>
                <p className="font-semibold text-ink">{formatRupees(r.amount)}</p>
                {r.calcType === 'percent' && r.basis && (
                  <p className="text-xs text-ink-muted">
                    {Number(r.percent)}% of monthly {BASIS_LABEL[r.basis]}
                  </p>
                )}
              </div>
            ),
          },
          {
            key: 'tax',
            header: 'TDS',
            render: (r) => <Badge tone={r.taxable ? 'warning' : 'neutral'}>{r.taxable ? 'Taxable' : 'Not taxable'}</Badge>,
          },
          { key: 'note', header: 'Note', render: (r) => r.note ?? '—' },
          ...(canManage
            ? [
              {
                key: 'actions',
                header: '',
                className: 'w-24 text-right',
                render: (r: PayrollBonus) => (
                  <div className="flex justify-end gap-1">
                    <button type="button" title="Edit" className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-primary" onClick={() => setOpen(r)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" title="Delete" className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-danger" onClick={() => handleDelete(r)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
              },
            ]
            : []),
        ]}
      />
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {open && (
        <BonusFormModal
          bonus={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function BonusFormModal({ bonus, onClose, onSaved }: { bonus: PayrollBonus | null; onClose: () => void; onSaved: () => void }) {
  const showToast = useToast();
  const now = new Date();
  const isEdit = !!bonus;
  const [selected, setSelected] = useState<Map<string, GroupEmployee>>(new Map());
  const [year, setYear] = useState(String(bonus?.periodYear ?? now.getFullYear()));
  const [month, setMonth] = useState(String(bonus?.periodMonth ?? now.getMonth() + 1));
  // New bonus: any number of months (one bonus each); editing keeps one month.
  const [months, setMonths] = useState<string[]>([`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`]);
  const [type, setType] = useState<BonusType>(bonus?.type ?? 'bonus');
  const [title, setTitle] = useState(bonus?.title ?? '');
  const [calcType, setCalcType] = useState<'fixed' | 'percent'>(bonus?.calcType ?? 'fixed');
  const [amount, setAmount] = useState(bonus && bonus.calcType !== 'percent' ? String(bonus.amount) : '');
  const [percent, setPercent] = useState(bonus?.percent ? String(bonus.percent) : '');
  const [basis, setBasis] = useState<'basic' | 'gross'>(bonus?.basis ?? 'basic');
  const [taxable, setTaxable] = useState(bonus?.taxable ?? true);
  const [note, setNote] = useState(bonus?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // After a bulk add that skipped someone: what happened, before closing.
  const [result, setResult] = useState<{ created: number; skipped: SkippedBonus[] } | null>(null);

  function changeType(next: BonusType) {
    setType(next);
    setTaxable(BONUS_TYPES.find((t) => t.key === next)?.taxable ?? true);
  }

  async function handleSave() {
    if (!isEdit && selected.size === 0) return setError('Choose at least one employee.');
    if (!isEdit && months.length === 0) return setError('Choose at least one month.');
    const value = Number(calcType === 'percent' ? percent : amount);
    if (!value || value <= 0) return setError(calcType === 'percent' ? 'Enter a percentage above zero.' : 'Enter an amount above zero.');
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        type,
        title: title.trim() || null,
        calcType,
        ...(calcType === 'percent' ? { percent: value, basis } : { amount: value }),
        taxable,
        note: note.trim() || null,
      };
      if (bonus) {
        await updateBonus(String(bonus.id), { ...body, year: Number(year), month: Number(month) });
        showToast('Saved — it will be paid with that month’s salary.', 'success');
        onSaved();
        return;
      }
      const r = await createBonus({
        ...body,
        employeeIds: [...selected.keys()],
        periods: months.map((k) => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) })),
      });
      if (r.skipped.length === 0) {
        showToast(`Added ${r.data.length} bonus${r.data.length === 1 ? '' : 'es'} — paid with the chosen month’s salary only.`, 'success');
        onSaved();
      } else {
        setResult({ created: r.data.length, skipped: r.skipped });
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save.'));
    } finally {
      setIsSaving(false);
    }
  }

  if (result) {
    return (
      <Modal title="Bonus added" onClose={onSaved}>
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-success/10 px-3 py-2 text-success">
            Added {result.created} bonus{result.created === 1 ? '' : 'es'}.
          </p>
          <div>
            <p className="mb-1 font-medium text-ink">Skipped {result.skipped.length}:</p>
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {result.skipped.map((s, i) => (
                <li key={`${s.employeeId}-${i}`} className="flex justify-between gap-2">
                  <span className="text-ink">
                    {s.name ?? `Employee #${s.employeeId}`} {s.employeeCode ? `(${s.employeeCode})` : ''}
                  </span>
                  <span className="text-warning">{s.reason}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-ink-muted">Assign them a salary for that month, then add the bonus again.</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={onSaved}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={isEdit ? 'Edit bonus' : 'Add bonus'} onClose={onClose} widthClassName={isEdit ? undefined : 'max-w-2xl'}>
      <div className="space-y-3">
        {isEdit ? (
          <div className="rounded-xl bg-page px-3 py-2 text-sm">
            <p className="font-medium text-ink">
              {bonus?.employee?.name} {bonus?.employee?.employeeCode ? `(${bonus.employee.employeeCode})` : ''}
            </p>
            <p className="text-ink-muted">{orgLabel(bonus?.employee)}</p>
          </div>
        ) : (
          <EmployeeMultiPicker selected={selected} onChange={setSelected} />
        )}

        {isEdit ? (
          <div className="grid grid-cols-2 gap-2">
            <Select label="Paid in month" value={month} onChange={(e) => setMonth(e.target.value)} options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))} />
            <Select label="Year" value={year} onChange={(e) => setYear(e.target.value)} options={yearOptions()} />
          </div>
        ) : (
          <MonthMultiPicker
            label="Paid in month(s)"
            value={months}
            onChange={setMonths}
            hint="Paid once in each chosen month’s salary — no other month changes. For something paid every month, add an allowance instead."
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Select label="Type" value={type} onChange={(e) => changeType(e.target.value as BonusType)} options={BONUS_TYPES.map((t) => ({ value: t.key, label: t.label }))} />
          <Select
            label="Amount is"
            value={calcType}
            onChange={(e) => setCalcType(e.target.value as 'fixed' | 'percent')}
            options={[
              { value: 'fixed', label: 'Fixed ₹ (same for everyone)' },
              { value: 'percent', label: '% of salary (differs per employee)' },
            ]}
          />
        </div>
        {calcType === 'fixed' ? (
          <Input label="Amount (₹)" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Percentage (%)" type="number" min={0} step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} />
              <Select
                label="Of monthly"
                value={basis}
                onChange={(e) => setBasis(e.target.value as 'basic' | 'gross')}
                options={[
                  { value: 'basic', label: 'Basic' },
                  { value: 'gross', label: 'Gross salary' },
                ]}
              />
            </div>
            <p className="-mt-1 text-xs text-ink-muted">
              Worked out for each employee from their full monthly {BASIS_LABEL[basis]} in that month (not cut for LOP). E.g. 100%
              of Gross = one month’s gross salary. If their salary for that month changes later, the bonus follows it.
            </p>
          </>
        )}
        <Input label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali bonus, Q3 sales incentive" />
        <Toggle
          checked={taxable}
          onChange={setTaxable}
          label="Counts for income tax (TDS)"
          description={taxable ? 'Extra tax on it is deducted in the same month (when TDS is on in the template).' : 'Not counted as income — e.g. a reimbursement against bills.'}
        />
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            {isEdit ? 'Save' : selected.size > 1 ? `Add for ${selected.size} employees` : 'Add bonus'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

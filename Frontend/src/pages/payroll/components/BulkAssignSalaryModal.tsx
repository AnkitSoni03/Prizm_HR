import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { useToast } from '../../../context/toast-context';
import { apiErrorMessage } from '../../../utils/apiError';
import {
  bulkAssignSalary,
  formatRupees,
  isItemOnInTemplate,
  listCustomItems,
  listTemplates,
  templateOptionLabel,
  previewSalary,
  type BuiltInItem,
  type GroupEmployee,
  type PayrollTemplate,
  type SalaryBreakdown,
  type SkippedEmployee,
} from '../../../api/payroll';
import { EmployeeMultiPicker } from './EmployeeMultiPicker';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

function firstOfThisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

const currentOf = (e: GroupEmployee) => e.salaryAssignments?.[0];

// One template, start date and set of deduction switches for many employees;
// each gets their own gross salary (or one figure applied to everyone). For someone
// who already has a salary this is a revision from the start date.
export function BulkAssignSalaryModal({ onClose, onSaved }: Props) {
  const showToast = useToast();
  const [selected, setSelected] = useState<Map<string, GroupEmployee>>(new Map());
  const [templates, setTemplates] = useState<PayrollTemplate[]>([]);
  const [builtIn, setBuiltIn] = useState<BuiltInItem[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [grossPeriod, setGrossPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [effectiveFrom, setEffectiveFrom] = useState(firstOfThisMonth());
  const [deductionsEnabled, setDeductionsEnabled] = useState(true);
  const [disabledItems, setDisabledItems] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [grosses, setGrosses] = useState<Record<string, string>>({});
  const [sameGross, setSameGross] = useState('');
  const [preview, setPreview] = useState<SalaryBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: SkippedEmployee[] } | null>(null);

  useEffect(() => {
    listTemplates().then(setTemplates).catch(() => setError('Could not load salary templates.'));
    listCustomItems()
      .then((r) => {
        setBuiltIn(r.builtInItems);
      })
      .catch(() => undefined);
  }, []);

  const template = templates.find((t) => String(t.id) === templateId);
  const items = useMemo(() => {
    if (!template) return [];
    return builtIn.filter((i) => isItemOnInTemplate(template.rules, i.key));
  }, [template, builtIn]);
  const deductionItems = items;

  // Sample breakdown for the "same gross" figure, so the template can be checked.
  const sample = Number(sameGross);
  const canPreview = !!templateId && sample > 0;
  useEffect(() => {
    if (!templateId || !(sample > 0)) return undefined;
    const handle = setTimeout(() => {
      previewSalary({ templateId, grossPeriod, grossAmount: sample, deductionsEnabled, disabledItems })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(handle);
  }, [templateId, grossPeriod, sample, deductionsEnabled, disabledItems]);

  const employees = [...selected.values()];
  const filled = employees.filter((e) => Number(grosses[String(e.id)]) > 0).length;

  function toggleItem(key: string, on: boolean) {
    setDisabledItems((list) => (on ? list.filter((k) => k !== key) : [...new Set([...list, key])]));
  }

  function applySameToAll() {
    if (!(sample > 0)) return setError('Enter the gross salary to apply to everyone.');
    setError(null);
    const next = { ...grosses };
    employees.forEach((e) => {
      next[String(e.id)] = String(sample);
    });
    setGrosses(next);
  }

  function useCurrentGross() {
    const next = { ...grosses };
    employees.forEach((e) => {
      const current = currentOf(e);
      if (current) next[String(e.id)] = String(Number(current.monthlyGross) * (grossPeriod === 'yearly' ? 12 : 1));
    });
    setGrosses(next);
  }

  async function handleSave() {
    if (selected.size === 0) return setError('Choose at least one employee.');
    if (!templateId) return setError('Choose a salary template.');
    if (!effectiveFrom) return setError('Choose the date the salary starts from.');
    if (filled === 0) return setError('Enter the gross salary for the employees.');
    setIsSaving(true);
    setError(null);
    try {
      const r = await bulkAssignSalary({
        templateId,
        grossPeriod,
        effectiveFrom,
        deductionsEnabled,
        disabledItems,
        note: note.trim() || null,
        items: employees.map((e) => ({ employeeId: String(e.id), grossAmount: Number(grosses[String(e.id)]) || 0 })),
      });
      if (r.skipped.length === 0) {
        showToast(`Salary assigned to ${r.data.length} employee${r.data.length === 1 ? '' : 's'}.`, 'success');
        onSaved();
      } else {
        setResult({ created: r.data.length, skipped: r.skipped });
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not assign the salaries.'));
    } finally {
      setIsSaving(false);
    }
  }

  if (result) {
    return (
      <Modal title="Salaries assigned" onClose={onSaved}>
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-success/10 px-3 py-2 text-success">
            Assigned to {result.created} employee{result.created === 1 ? '' : 's'}.
          </p>
          <div>
            <p className="mb-1 font-medium text-ink">Skipped {result.skipped.length}:</p>
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {result.skipped.map((s) => (
                <li key={s.employeeId} className="flex flex-wrap justify-between gap-x-2">
                  <span className="text-ink">
                    {s.name ?? `Employee #${s.employeeId}`} {s.employeeCode ? `(${s.employeeCode})` : ''}
                  </span>
                  <span className="text-warning">{s.reason}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end">
            <Button onClick={onSaved}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  const unit = grossPeriod === 'yearly' ? 'year' : 'month';

  return (
    <Modal title="Bulk assign salary" onClose={onClose} widthClassName="max-w-4xl">
      <div className="space-y-4">
        <EmployeeMultiPicker selected={selected} onChange={setSelected} skipLocked />

        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Salary template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Choose…"
            options={templates.filter((t) => t.isActive).map((t) => ({ value: String(t.id), label: templateOptionLabel(t) }))}
          />
          <Select
            label="Gross salary is"
            value={grossPeriod}
            onChange={(e) => setGrossPeriod(e.target.value as 'monthly' | 'yearly')}
            options={[
              { value: 'monthly', label: 'Per month' },
              { value: 'yearly', label: 'Per year' },
            ]}
          />
          <Input label="Salary starts from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </div>
        <p className="-mt-2 text-xs text-ink-muted">
          For anyone who already has a salary, this replaces it from the start date (it must be after their current salary’s
          start date, or they are skipped).
        </p>

        <div className="rounded-xl border border-border p-3">
          <Toggle
            checked={deductionsEnabled}
            onChange={setDeductionsEnabled}
            label="Apply deductions"
            description={deductionsEnabled ? 'Turn off any single deduction below for all these employees.' : 'No deductions and no employer contributions — in-hand = gross.'}
          />
          {deductionsEnabled && template && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {deductionItems.length === 0 && <p className="text-sm text-ink-muted">This template has no deductions switched on.</p>}
              {deductionItems.map((item) => (
                <Toggle
                  key={item.key}
                  checked={!disabledItems.includes(item.key)}
                  onChange={(on) => toggleItem(item.key, on)}
                  label={item.label}
                  description={item.kind === 'deduction' ? 'Employee deduction' : 'Employer contribution'}
                />
              ))}
            </div>
          )}
        </div>

        <section className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <Input label={`Same gross for all (₹ per ${unit})`} type="number" min={0} value={sameGross} onChange={(e) => setSameGross(e.target.value)} />
            </div>
            <Button variant="secondary" onClick={applySameToAll} disabled={employees.length === 0}>Apply to all</Button>
            <Button variant="secondary" onClick={useCurrentGross} disabled={employees.length === 0}>Fill current gross</Button>
            <span className="ml-auto text-xs text-ink-muted">{filled} of {employees.length} have a gross salary</span>
          </div>
          {employees.length === 0 ? (
            <p className="rounded-xl bg-page px-3 py-2 text-sm text-ink-muted">Choose employees above, then enter each one’s gross salary here.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
              {employees.map((e) => {
                const current = currentOf(e);
                return (
                  <div key={e.id} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ink">
                        {e.name ?? '—'} {e.employeeCode ? `(${e.employeeCode})` : ''}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {[e.company?.name, e.brand?.name].filter(Boolean).join(' › ')}
                        {current ? ` · now ${formatRupees(current.monthlyGross)}/month since ${current.effectiveFrom}` : ' · no salary yet'}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      aria-label={`Gross salary for ${e.name ?? 'employee'}`}
                      value={grosses[String(e.id)] ?? ''}
                      onChange={(ev) => setGrosses({ ...grosses, [String(e.id)]: ev.target.value })}
                      placeholder={`₹ / ${unit}`}
                      className="w-36 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-ink-muted">Anyone left without a gross salary is skipped.</p>
        </section>

        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

        {canPreview && preview && (
          <p className="rounded-xl bg-page px-3 py-2 text-sm text-ink-muted">
            At {formatRupees(sample)} per {unit}: gross {formatRupees(preview.full.grossSalary)}, deductions{' '}
            {formatRupees(preview.full.totalDeductions)}, in-hand <span className="font-semibold text-ink">{formatRupees(preview.full.inHand)}</span> a month
            {' '}(PT by each employee’s work state may differ).
          </p>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            {selected.size > 0 ? `Assign to ${selected.size} employee${selected.size === 1 ? '' : 's'}` : 'Assign'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

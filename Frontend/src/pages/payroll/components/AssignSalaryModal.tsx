import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { apiErrorMessage } from '../../../utils/apiError';
import {
  assignSalary,
  formatRupees,
  isItemOnInTemplate,
  listCustomItems,
  listGroupEmployees,
  listScopeCompanies,
  listTemplates,
  previewSalary,
  updateAssignment,
  type BuiltInItem,
  type GroupEmployee,
  type PayrollCustomItem,
  type PayrollTemplate,
  type SalaryAssignment,
  type SalaryBreakdown,
  type ScopeCompany,
} from '../../../api/payroll';
import { SalaryBreakdownView } from './SalaryBreakdownView';

interface Props {
  // Set = correcting that salary in place; null = a new salary / revision.
  assignment: SalaryAssignment | null;
  onClose: () => void;
  onSaved: () => void;
}

function firstOfThisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export function AssignSalaryModal({ assignment, onClose, onSaved }: Props) {
  const isEdit = !!assignment;
  const [companies, setCompanies] = useState<ScopeCompany[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState<GroupEmployee[]>([]);
  const [employeeId, setEmployeeId] = useState(assignment?.employeeId ?? '');
  const [templates, setTemplates] = useState<PayrollTemplate[]>([]);
  const [builtIn, setBuiltIn] = useState<BuiltInItem[]>([]);
  const [custom, setCustom] = useState<PayrollCustomItem[]>([]);
  const [templateId, setTemplateId] = useState(assignment?.templateId ? String(assignment.templateId) : '');
  const [ctcPeriod, setCtcPeriod] = useState<'monthly' | 'yearly'>(assignment?.ctcPeriod ?? 'monthly');
  const [ctcAmount, setCtcAmount] = useState(assignment ? String(Number(assignment.ctcAmount)) : '');
  const [effectiveFrom, setEffectiveFrom] = useState(firstOfThisMonth());
  const [deductionsEnabled, setDeductionsEnabled] = useState(assignment?.deductionsEnabled ?? true);
  const [disabledItems, setDisabledItems] = useState<string[]>(assignment?.disabledItems ?? []);
  const [note, setNote] = useState(assignment?.note ?? '');
  const [preview, setPreview] = useState<SalaryBreakdown | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listTemplates().then((t) => setTemplates(t)).catch(() => setError('Could not load salary templates.'));
    listCustomItems()
      .then((r) => {
        setBuiltIn(r.builtInItems);
        setCustom(r.data.filter((i) => i.isActive));
      })
      .catch(() => undefined);
    if (!isEdit) listScopeCompanies().then(setCompanies).catch(() => undefined);
  }, [isEdit]);

  useEffect(() => {
    if (isEdit) return undefined;
    const handle = setTimeout(() => {
      listGroupEmployees({ companyId: companyId || undefined, search: search || undefined, limit: 100 })
        .then((r) => setEmployees(r.data))
        .catch(() => setEmployees([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [companyId, search, isEdit]);

  const employee = isEdit ? assignment?.employee : employees.find((e) => String(e.id) === employeeId);
  const currentSalary = !isEdit ? (employee as GroupEmployee | undefined)?.salaryAssignments?.[0] : undefined;
  const template = templates.find((t) => String(t.id) === templateId);
  const items = useMemo(() => {
    if (!template) return [];
    const all = [
      ...builtIn,
      ...custom.map((c) => ({ key: `custom_${c.id}`, kind: c.kind, label: c.name })),
    ];
    return all.filter((i) => isItemOnInTemplate(template.rules, i.key));
  }, [template, builtIn, custom]);
  // Allowances are pay, so the "Apply deductions" switch doesn't touch them.
  const allowanceItems = items.filter((i) => i.kind === 'earning');
  const deductionItems = items.filter((i) => i.kind !== 'earning');

  const amount = Number(ctcAmount);
  const canPreview = !!templateId && amount > 0;
  useEffect(() => {
    if (!templateId || !amount || amount <= 0) return undefined;
    const handle = setTimeout(() => {
      previewSalary({
        templateId,
        ctcPeriod,
        ctcAmount: amount,
        deductionsEnabled,
        disabledItems,
        workState: employee?.workState ?? null,
      })
        .then((p) => {
          setPreview(p);
          setPreviewError(null);
        })
        .catch((err) => setPreviewError(apiErrorMessage(err, 'Could not calculate the preview.')));
    }, 350);
    return () => clearTimeout(handle);
  }, [templateId, ctcPeriod, amount, deductionsEnabled, disabledItems, employee?.workState]);

  function toggleItem(key: string, on: boolean) {
    setDisabledItems((list) => (on ? list.filter((k) => k !== key) : [...new Set([...list, key])]));
  }

  async function handleSave() {
    if (!isEdit && !employeeId) return setError('Choose an employee.');
    if (!templateId) return setError('Choose a salary template.');
    if (!amount || amount <= 0) return setError('Enter the CTC.');
    setIsSaving(true);
    setError(null);
    try {
      const body = { templateId, ctcPeriod, ctcAmount: amount, deductionsEnabled, disabledItems, note: note.trim() || null };
      if (isEdit) await updateAssignment(assignment!.id, body);
      else await assignSalary({ ...body, employeeId, effectiveFrom });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the salary.'));
    } finally {
      setIsSaving(false);
    }
  }

  const companyOptions = companies.map((c) => ({ value: String(c.id), label: c.name }));
  const employeeLabel = (e: GroupEmployee) =>
    `${e.name ?? '—'}${e.employeeCode ? ` (${e.employeeCode})` : ''} · ${e.company?.name ?? ''}${e.brand ? ` › ${e.brand.name}` : ''}`;

  return (
    <Modal title={isEdit ? 'Correct salary' : 'Assign salary'} onClose={onClose} widthClassName="max-w-4xl">
      <div className="space-y-4">
        {isEdit ? (
          <div className="rounded-xl bg-page px-3 py-2 text-sm">
            <p className="font-medium text-ink">
              {assignment?.employee?.name} {assignment?.employee?.employeeCode ? `(${assignment.employee.employeeCode})` : ''}
            </p>
            <p className="text-ink-muted">
              Salary from {assignment?.effectiveFrom}. Use this only to fix a mistake — every month already generated on this
              salary is recalculated, and any difference is adjusted in the next salary. For a raise, assign a new salary instead.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Company" value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="All companies" options={companyOptions} />
            <Input label="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or code" />
            <Select
              label="Employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder={employees.length ? 'Choose…' : 'No employees found'}
              options={employees.map((e) => ({ value: String(e.id), label: employeeLabel(e) }))}
            />
          </div>
        )}

        {currentSalary && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            Currently on {formatRupees(currentSalary.monthlyCtc)}/month since {currentSalary.effectiveFrom}. The new salary
            replaces it from the date below.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <Select
            label="Salary template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Choose…"
            options={templates.filter((t) => t.isActive || String(t.id) === templateId).map((t) => ({ value: String(t.id), label: t.name }))}
          />
          <Select
            label="CTC is"
            value={ctcPeriod}
            onChange={(e) => setCtcPeriod(e.target.value as 'monthly' | 'yearly')}
            options={[
              { value: 'monthly', label: 'Per month' },
              { value: 'yearly', label: 'Per year' },
            ]}
          />
          <Input label={`CTC (₹ per ${ctcPeriod === 'yearly' ? 'year' : 'month'})`} type="number" min={0} value={ctcAmount} onChange={(e) => setCtcAmount(e.target.value)} />
          {!isEdit && (
            <Input label="Salary starts from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          )}
        </div>
        {ctcPeriod === 'yearly' && amount > 0 && (
          <p className="-mt-2 text-xs text-ink-muted">= {formatRupees(Math.round((amount / 12) * 100) / 100)} per month</p>
        )}

        <div className="rounded-xl border border-border p-3">
          <Toggle
            checked={deductionsEnabled}
            onChange={setDeductionsEnabled}
            label="Apply deductions"
            description={deductionsEnabled ? 'Turn off any single deduction below for this employee.' : 'No deductions and no employer contributions — in-hand = CTC.'}
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

        {template && allowanceItems.length > 0 && (
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-medium text-ink">Allowances</p>
            <p className="mb-2 text-xs text-ink-muted">Part of CTC. Turning one off moves its amount back into the Special allowance.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {allowanceItems.map((item) => (
                <Toggle
                  key={item.key}
                  checked={!disabledItems.includes(item.key)}
                  onChange={(on) => toggleItem(item.key, on)}
                  label={item.label}
                  description="Allowance"
                />
              ))}
            </div>
          </div>
        )}

        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

        <section className="rounded-xl bg-page p-3">
          <h3 className="mb-2 text-sm font-semibold text-ink">
            Monthly salary{employee?.workState ? ` · ${employee.workState}` : ''}
          </h3>
          {(!canPreview || (!preview && !previewError)) && <p className="text-sm text-ink-muted">Choose a template and enter the CTC to see the breakdown.</p>}
          {previewError && <p className="text-sm text-danger">{previewError}</p>}
          {canPreview && preview && !previewError && <SalaryBreakdownView breakdown={preview} monthlyCtc={preview.monthlyCtc} mode="full" />}
        </section>

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving}>{isEdit ? 'Save correction' : 'Assign salary'}</Button>
        </div>
      </div>
    </Modal>
  );
}

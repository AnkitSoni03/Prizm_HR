import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Toggle } from '../../../components/ui/Toggle';
import { apiErrorMessage } from '../../../utils/apiError';
import { INDIAN_STATES } from '../../../utils/indianStates';
import {
  createTemplate,
  getTemplateDefaults,
  listCustomItems,
  monthKeyLabel,
  previewSalary,
  updateTemplate,
  type PayrollCustomItem,
  type PayrollRules,
  type PayrollTemplate,
  type RateRule,
  type SalaryBreakdown,
} from '../../../api/payroll';
import { SalaryBreakdownView } from './SalaryBreakdownView';

interface Props {
  template: PayrollTemplate | null; // null = new
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Section = 'deductions' | 'employer';

function NumberField({ label, value, onChange, disabled, suffix }: {
  label: string;
  value: number | undefined;
  onChange: (n: number) => void;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <Input
      compact
      label={suffix ? `${label} (${suffix})` : label}
      type="number"
      min={0}
      step="0.01"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    />
  );
}

function RuleCard({ title, description, enabled, onToggle, disabled, children }: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${enabled ? 'border-primary/30' : 'border-border'}`}>
      <Toggle checked={enabled} onChange={onToggle} label={title} description={description} disabled={disabled} />
      {enabled && children && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>}
    </div>
  );
}

// Salary template: every %, cap and on/off switch the Group's payroll follows.
// Kept as one plain form — no wizard.
export function TemplateFormModal({ template, readOnly = false, onClose, onSaved }: Props) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [rules, setRules] = useState<PayrollRules | null>(template?.rules ?? null);
  const [customItems, setCustomItems] = useState<PayrollCustomItem[]>([]);
  const [previewCtc, setPreviewCtc] = useState(30000);
  const [previewState, setPreviewState] = useState('');
  const [preview, setPreview] = useState<SalaryBreakdown | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listCustomItems()
      .then((r) => setCustomItems(r.data.filter((i) => i.isActive)))
      .catch(() => setCustomItems([]));
    if (!template) {
      getTemplateDefaults()
        .then((d) => setRules(d.rules))
        .catch(() => setError('Could not load template defaults.'));
    }
  }, [template]);

  useEffect(() => {
    if (!rules || !previewCtc) return undefined;
    const handle = setTimeout(() => {
      previewSalary({ rules, ctcPeriod: 'monthly', ctcAmount: previewCtc, workState: previewState || null })
        .then((p) => {
          setPreview(p);
          setPreviewError(null);
        })
        .catch((err) => setPreviewError(apiErrorMessage(err, 'Could not calculate the preview.')));
    }, 350);
    return () => clearTimeout(handle);
  }, [rules, previewCtc, previewState]);

  if (!rules) {
    return (
      <Modal title={template ? template.name : 'New salary template'} onClose={onClose} widthClassName="max-w-4xl">
        <p className="text-sm text-ink-muted">{error ?? 'Loading…'}</p>
      </Modal>
    );
  }

  const setRule = (section: Section, key: string, patch: Partial<RateRule>) =>
    setRules((r) => {
      if (!r) return r;
      const sectionRules = r[section] as Record<string, RateRule>;
      return { ...r, [section]: { ...sectionRules, [key]: { ...sectionRules[key], ...patch } } };
    });
  const d = rules.deductions;
  const er = rules.employer;
  const ro = readOnly;

  async function handleSave() {
    if (!name.trim()) {
      setError('Give the template a name.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), description: description.trim() || null, rules: rules!, isActive };
      if (template) await updateTemplate(template.id, body);
      else await createTemplate(body);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the template.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={template ? (ro ? template.name : `Edit ${template.name}`) : 'New salary template'} onClose={onClose} widthClassName="max-w-4xl">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Template name" value={name} disabled={ro} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard staff" />
          <Input label="Description (optional)" value={description} disabled={ro} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Toggle checked={isActive} onChange={setIsActive} disabled={ro} label="Active" description="Only active templates can be given to employees." />

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Salary split</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NumberField label="Basic" suffix="% of CTC" value={rules.basicPercentOfCtc} disabled={ro} onChange={(n) => setRules({ ...rules, basicPercentOfCtc: n })} />
            <NumberField label="HRA" suffix="% of Basic" value={rules.hraPercentOfBasic} disabled={ro} onChange={(n) => setRules({ ...rules, hraPercentOfBasic: n })} />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Special allowance is the balancing figure: Gross (CTC − employer contributions) − Basic − HRA.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Employee deductions</h3>
          <p className="mb-2 text-xs text-ink-muted">Turn off anything your company doesn&apos;t deduct. Each one can also be turned off per employee.</p>
          <div className="space-y-2">
            <RuleCard title="Employee PF" description="Provident Fund, % of Basic" enabled={d.pf.enabled} disabled={ro} onToggle={(v) => setRule('deductions', 'pf', { enabled: v })}>
              <NumberField label="Rate" suffix="%" value={d.pf.rate} disabled={ro} onChange={(n) => setRule('deductions', 'pf', { rate: n })} />
              <NumberField label="Basic cap" suffix="₹" value={d.pf.ceiling} disabled={ro || !d.pf.applyCeiling} onChange={(n) => setRule('deductions', 'pf', { ceiling: n })} />
              <div className="flex items-end pb-1">
                <Toggle checked={!!d.pf.applyCeiling} disabled={ro} onChange={(v) => setRule('deductions', 'pf', { applyCeiling: v })} label="Apply cap" />
              </div>
            </RuleCard>
            <RuleCard title="Employee ESI" description="% of Gross, only while gross is within the limit" enabled={d.esi.enabled} disabled={ro} onToggle={(v) => setRule('deductions', 'esi', { enabled: v })}>
              <NumberField label="Rate" suffix="%" value={d.esi.rate} disabled={ro} onChange={(n) => setRule('deductions', 'esi', { rate: n })} />
              <NumberField label="Gross limit" suffix="₹" value={d.esi.grossLimit} disabled={ro} onChange={(n) => setRule('deductions', 'esi', { grossLimit: n })} />
            </RuleCard>
            <RuleCard title="Professional Tax" description="By the employee's work state, or one fixed amount" enabled={d.pt.enabled} disabled={ro} onToggle={(v) => setRule('deductions', 'pt', { enabled: v })}>
              <Select
                label="How"
                value={d.pt.mode}
                disabled={ro}
                onChange={(e) => setRule('deductions', 'pt', { mode: e.target.value as 'state' | 'fixed' })}
                options={[
                  { value: 'state', label: 'Work state slab' },
                  { value: 'fixed', label: 'Fixed amount' },
                ]}
              />
              {d.pt.mode === 'fixed' && (
                <NumberField label="Amount" suffix="₹/month" value={d.pt.fixedAmount} disabled={ro} onChange={(n) => setRule('deductions', 'pt', { fixedAmount: n })} />
              )}
            </RuleCard>
            <RuleCard title="Labour Welfare Fund (employee)" description="Fixed amount every month" enabled={d.lwf.enabled} disabled={ro} onToggle={(v) => setRule('deductions', 'lwf', { enabled: v })}>
              <NumberField label="Amount" suffix="₹/month" value={d.lwf.amount} disabled={ro} onChange={(n) => setRule('deductions', 'lwf', { amount: n })} />
            </RuleCard>
            <RuleCard title="Income Tax (TDS)" description="New tax regime, worked out automatically on the yearly salary" enabled={d.tds.enabled} disabled={ro} onToggle={(v) => setRule('deductions', 'tds', { enabled: v })} />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Employer contributions</h3>
          <p className="mb-2 text-xs text-ink-muted">Paid by the company out of the CTC — they lower the gross salary, not the deductions.</p>
          <div className="space-y-2">
            <RuleCard title="Employer PF (EPF + EPS)" description="% of Basic; EPS part goes to the pension" enabled={er.pf.enabled} disabled={ro} onToggle={(v) => setRule('employer', 'pf', { enabled: v })}>
              <NumberField label="Rate" suffix="%" value={er.pf.rate} disabled={ro} onChange={(n) => setRule('employer', 'pf', { rate: n })} />
              <NumberField label="EPS pension" suffix="%" value={er.pf.epsRate} disabled={ro} onChange={(n) => setRule('employer', 'pf', { epsRate: n })} />
              <NumberField label="Basic cap" suffix="₹" value={er.pf.ceiling} disabled={ro || !er.pf.applyCeiling} onChange={(n) => setRule('employer', 'pf', { ceiling: n })} />
              <div className="flex items-end pb-1">
                <Toggle checked={!!er.pf.applyCeiling} disabled={ro} onChange={(v) => setRule('employer', 'pf', { applyCeiling: v })} label="Apply cap" />
              </div>
            </RuleCard>
            <RuleCard title="EDLI" description="% of Basic (capped)" enabled={er.edli.enabled} disabled={ro} onToggle={(v) => setRule('employer', 'edli', { enabled: v })}>
              <NumberField label="Rate" suffix="%" value={er.edli.rate} disabled={ro} onChange={(n) => setRule('employer', 'edli', { rate: n })} />
              <NumberField label="Basic cap" suffix="₹" value={er.edli.ceiling} disabled={ro} onChange={(n) => setRule('employer', 'edli', { ceiling: n })} />
            </RuleCard>
            <RuleCard title="EPF admin charges" description="% of Basic (capped)" enabled={er.pfAdmin.enabled} disabled={ro} onToggle={(v) => setRule('employer', 'pfAdmin', { enabled: v })}>
              <NumberField label="Rate" suffix="%" value={er.pfAdmin.rate} disabled={ro} onChange={(n) => setRule('employer', 'pfAdmin', { rate: n })} />
              <NumberField label="Basic cap" suffix="₹" value={er.pfAdmin.ceiling} disabled={ro} onChange={(n) => setRule('employer', 'pfAdmin', { ceiling: n })} />
            </RuleCard>
            <RuleCard title="Gratuity provision" description="% of Basic, paid on exit" enabled={er.gratuity.enabled} disabled={ro} onToggle={(v) => setRule('employer', 'gratuity', { enabled: v })}>
              <NumberField label="Rate" suffix="%" value={er.gratuity.rate} disabled={ro} onChange={(n) => setRule('employer', 'gratuity', { rate: n })} />
            </RuleCard>
            <RuleCard title="Employer ESI" description="% of Gross, only while gross is within the limit" enabled={er.esi.enabled} disabled={ro} onToggle={(v) => setRule('employer', 'esi', { enabled: v })}>
              <NumberField label="Rate" suffix="%" value={er.esi.rate} disabled={ro} onChange={(n) => setRule('employer', 'esi', { rate: n })} />
              <NumberField label="Gross limit" suffix="₹" value={er.esi.grossLimit} disabled={ro} onChange={(n) => setRule('employer', 'esi', { grossLimit: n })} />
            </RuleCard>
            <RuleCard title="Labour Welfare Fund (employer)" description="Fixed amount every month" enabled={er.lwf.enabled} disabled={ro} onToggle={(v) => setRule('employer', 'lwf', { enabled: v })}>
              <NumberField label="Amount" suffix="₹/month" value={er.lwf.amount} disabled={ro} onChange={(n) => setRule('employer', 'lwf', { amount: n })} />
            </RuleCard>
          </div>
        </section>

        {customItems.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-ink">Extra allowances &amp; deductions (added for the whole Group)</h3>
            <p className="mb-2 text-xs text-ink-muted">Off until you switch them on here — only employees on this template get the ones you turn on.</p>
            <div className="space-y-2">
              {[...customItems].sort((a, b) => Number(b.kind === 'earning') - Number(a.kind === 'earning')).map((item) => {
                const cfg = rules.customItems[item.id] ?? { enabled: true };
                const setCfg = (patch: { enabled?: boolean; value?: number }) =>
                  setRules({ ...rules, customItems: { ...rules.customItems, [item.id]: { ...cfg, ...patch } } });
                const unit = item.calcType === 'fixed' ? '₹/month' : `% of ${item.basis === 'ctc' ? 'CTC' : item.basis === 'gross' ? 'Gross' : 'Basic'}`;
                return (
                  <RuleCard
                    key={item.id}
                    title={item.name}
                    description={
                      `${
                        item.kind === 'earning'
                          ? 'Allowance — taken out of the Special allowance'
                          : item.kind === 'deduction'
                            ? 'Employee deduction'
                            : 'Employer contribution'
                      }${item.months && item.months.length > 0 ? ` · only in ${item.months.map(monthKeyLabel).join(', ')}` : ''}`
                    }
                    enabled={cfg.enabled !== false}
                    disabled={ro}
                    onToggle={(v) => setCfg({ enabled: v })}
                  >
                    <NumberField label="Value" suffix={unit} value={cfg.value ?? Number(item.value)} disabled={ro} onChange={(n) => setCfg({ value: n })} />
                  </RuleCard>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Leave</h3>
          <Toggle
            checked={rules.sandwichRule}
            disabled={ro}
            onChange={(v) => setRules({ ...rules, sandwichRule: v })}
            label="Sandwich rule"
            description="A holiday / week-off between two leaves also counts as leave — taken from the leave balance, or unpaid when no balance is left."
          />
        </section>

        <section className="rounded-xl bg-page p-3">
          <h3 className="mb-2 text-sm font-semibold text-ink">Preview</h3>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NumberField label="Monthly CTC" suffix="₹" value={previewCtc} onChange={setPreviewCtc} />
            <Select
              label="Work state (for PT)"
              value={previewState}
              onChange={(e) => setPreviewState(e.target.value)}
              placeholder="Not set"
              options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          {previewError && <p className="text-sm text-danger">{previewError}</p>}
          {preview && !previewError && <SalaryBreakdownView breakdown={preview} monthlyCtc={preview.monthlyCtc} mode="full" />}
        </section>

        {error && <p className="text-sm text-danger">{error}</p>}
        {!ro && (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} isLoading={isSaving}>{template ? 'Save changes' : 'Create template'}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

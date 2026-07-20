import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { assignSalaryStructure } from '../../../api/companyAdmin/salaryStructures';
import type { SalaryComponentDefinition } from '../../../api/companyAdmin/salaryComponents';

interface SalaryStructureFormModalProps {
  employeeId: string;
  employeeName: string;
  components: SalaryComponentDefinition[];
  hasExistingStructure: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// One modal serves both an employee's first-ever assignment and a later
// revision — see assignSalaryStructure's supersede-in-place behavior on the
// backend. Every active catalog component is offered as an opt-in line item
// with its default value pre-filled and editable.
export function SalaryStructureFormModal({
  employeeId,
  employeeName,
  components,
  hasExistingStructure,
  onClose,
  onSaved,
}: SalaryStructureFormModalProps) {
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [annualCtc, setAnnualCtc] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(components.map((c) => c.id)));
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(components.map((c) => [c.id, String(c.defaultValue)]))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(componentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(componentId)) next.delete(componentId);
      else next.add(componentId);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError('Select at least one salary component.');
      return;
    }
    setIsSubmitting(true);
    try {
      await assignSalaryStructure({
        employeeId,
        effectiveFrom,
        annualCtc: Number(annualCtc),
        components: [...selected].map((componentDefinitionId) => ({
          componentDefinitionId,
          value: values[componentDefinitionId] ? Number(values[componentDefinitionId]) : undefined,
        })),
      });
      onSaved();
      onClose();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not assign this salary structure.';
      setError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      title={hasExistingStructure ? `Revise Salary Structure — ${employeeName}` : `Assign Salary Structure — ${employeeName}`}
      onClose={onClose}
      widthClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        {hasExistingStructure && (
          <p className="text-xs text-ink-muted">
            This creates a new version effective from the date below — the current structure is
            kept as history and used for any pay period before that date.
          </p>
        )}
        <Input
          id="structure-effective-from"
          label="Effective from"
          type="date"
          required
          value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
        />
        <Input
          id="structure-annual-ctc"
          label="Annual CTC"
          type="number"
          min={0}
          step="0.01"
          required
          value={annualCtc}
          onChange={(event) => setAnnualCtc(event.target.value)}
        />

        <div>
          <p className="mb-1.5 block text-sm font-medium text-ink">Components</p>
          <div className="space-y-2">
            {components.length === 0 && (
              <p className="text-sm text-ink-muted">
                No salary components exist yet — add some under the Components tab first.
              </p>
            )}
            {components.map((component) => (
              <div
                key={component.id}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="checkbox"
                  checked={selected.has(component.id)}
                  onChange={() => toggle(component.id)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{component.name}</p>
                  <p className="text-xs text-ink-muted">
                    {component.calculationType === 'fixed_amount'
                      ? 'Fixed amount / month'
                      : `% of ${component.percentageOfComponent?.name ?? 'another component'}`}
                    {' · '}
                    {component.componentCategory}
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!selected.has(component.id)}
                  value={values[component.id] ?? ''}
                  onChange={(event) => setValues((prev) => ({ ...prev, [component.id]: event.target.value }))}
                  className="w-24 rounded-lg border border-border px-2 py-1 text-sm text-ink disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {hasExistingStructure ? 'Save New Version' : 'Assign Structure'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

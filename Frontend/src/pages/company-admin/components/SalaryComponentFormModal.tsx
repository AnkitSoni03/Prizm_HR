import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import {
  createSalaryComponent,
  type CalculationType,
  type ComponentCategory,
  type SalaryComponentDefinition,
} from '../../../api/companyAdmin/salaryComponents';

interface SalaryComponentFormModalProps {
  existingComponents: SalaryComponentDefinition[];
  onClose: () => void;
  onSaved: () => void;
}

// Only creation is exposed here — a component's shape (fixed vs
// percentage-of, and which category) is a one-time catalog decision;
// editing is limited to name/amount/active state from the list row itself
// (see salaryComponent.service.js::updateComponent), which doesn't need a
// full modal.
export function SalaryComponentFormModal({ existingComponents, onClose, onSaved }: SalaryComponentFormModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [componentCategory, setComponentCategory] = useState<ComponentCategory>('earning');
  const [calculationType, setCalculationType] = useState<CalculationType>('fixed_amount');
  const [defaultValue, setDefaultValue] = useState('');
  const [percentageOfComponentId, setPercentageOfComponentId] = useState('');
  const [isPfWage, setIsPfWage] = useState(false);
  const [taxable, setTaxable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (calculationType === 'percentage_of_component' && !percentageOfComponentId) {
      setError('Choose which component this is a percentage of.');
      return;
    }
    setIsSubmitting(true);
    try {
      await createSalaryComponent({
        code,
        name,
        componentCategory,
        calculationType,
        defaultValue: defaultValue ? Number(defaultValue) : undefined,
        percentageOfComponentId: calculationType === 'percentage_of_component' ? percentageOfComponentId : undefined,
        isPfWage: componentCategory === 'earning' ? isPfWage : undefined,
        taxable: componentCategory !== 'deduction' ? taxable : undefined,
      });
      onSaved();
      onClose();
    } catch {
      setError('Could not create this component. The code may already be in use.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Add Salary Component" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="component-code"
          label="Code"
          required
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="HRA"
        />
        <Input
          id="component-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="House Rent Allowance"
        />
        <Select
          id="component-category"
          label="Category"
          value={componentCategory}
          onChange={(event) => setComponentCategory(event.target.value as ComponentCategory)}
          options={[
            { value: 'earning', label: 'Earning' },
            { value: 'deduction', label: 'Deduction' },
            { value: 'reimbursement', label: 'Reimbursement' },
          ]}
        />
        <Select
          id="component-calculation-type"
          label="Calculation"
          value={calculationType}
          onChange={(event) => setCalculationType(event.target.value as CalculationType)}
          options={[
            { value: 'fixed_amount', label: 'Fixed amount' },
            { value: 'percentage_of_component', label: 'Percentage of another component' },
          ]}
        />
        {calculationType === 'percentage_of_component' && (
          <Select
            id="component-percentage-of"
            label="Percentage of"
            value={percentageOfComponentId}
            onChange={(event) => setPercentageOfComponentId(event.target.value)}
            placeholder="Select a component"
            options={existingComponents.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          />
        )}
        <Input
          id="component-default-value"
          label={calculationType === 'percentage_of_component' ? 'Default percentage' : 'Default amount'}
          type="number"
          min={0}
          step="0.01"
          value={defaultValue}
          onChange={(event) => setDefaultValue(event.target.value)}
        />
        {componentCategory === 'earning' && (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={isPfWage}
              onChange={(event) => setIsPfWage(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-ink">Counts toward PF wage</span>
              <span className="block text-xs text-ink-muted">
                Include this component (e.g. Basic, DA) in the Provident Fund wage basis when
                statutory deductions are enabled.
              </span>
            </span>
          </label>
        )}
        {componentCategory !== 'deduction' && (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={taxable}
              onChange={(event) => setTaxable(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-ink">Taxable</span>
              <span className="block text-xs text-ink-muted">
                Include this component in TDS's taxable-income projection. Turn off for a
                reimbursement that isn't part of taxable salary.
              </span>
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Add Component
          </Button>
        </div>
      </form>
    </Modal>
  );
}

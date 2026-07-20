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

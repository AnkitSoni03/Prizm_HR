import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { createPayrollAdjustment } from '../../../api/companyAdmin/payrollAdjustments';
import type { Employee } from '../../../api/tenancy';
import { formatEmployeeLabel } from '../../../utils/employeeDisplay';

interface PayrollAdjustmentFormModalProps {
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function PayrollAdjustmentFormModal({ employees, onClose, onSaved }: PayrollAdjustmentFormModalProps) {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState('');
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1));
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const [type, setType] = useState<'bonus' | 'deduction'>('bonus');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!employeeId) {
      setError('Select an employee.');
      return;
    }
    setIsSubmitting(true);
    try {
      await createPayrollAdjustment({
        employeeId,
        periodMonth: Number(periodMonth),
        periodYear: Number(periodYear),
        type,
        amount: Number(amount),
        description: description || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not create this adjustment. That period may already be processed.';
      setError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Add Payroll Adjustment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Select
          id="adjustment-employee"
          label="Employee"
          required
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          placeholder="Select an employee"
          options={employees.map((e) => ({ value: e.id, label: formatEmployeeLabel(e) }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="adjustment-month"
            label="Month"
            value={periodMonth}
            onChange={(event) => setPeriodMonth(event.target.value)}
            options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
          />
          <Input
            id="adjustment-year"
            label="Year"
            type="number"
            value={periodYear}
            onChange={(event) => setPeriodYear(event.target.value)}
          />
        </div>
        <Select
          id="adjustment-type"
          label="Type"
          value={type}
          onChange={(event) => setType(event.target.value as 'bonus' | 'deduction')}
          options={[
            { value: 'bonus', label: 'Bonus (adds to pay)' },
            { value: 'deduction', label: 'Deduction (subtracts from pay)' },
          ]}
        />
        <Input
          id="adjustment-amount"
          label="Amount"
          type="number"
          min={0.01}
          step="0.01"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <Input
          id="adjustment-description"
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Diwali Bonus"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Add Adjustment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

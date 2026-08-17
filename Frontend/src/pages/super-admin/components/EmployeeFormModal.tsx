import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { createEmployee } from '../../../api/tenancy';

interface EmployeeFormModalProps {
  companyId: string;
  brandId?: string;
  onClose: () => void;
  onCreated: () => void;
}

// Super Admin's employee creation is deliberately minimal — a name is all
// that's needed to get someone into the system. Employee code is
// auto-generated, employment type defaults to full_time, and department/
// designation/roster/shift are left unset entirely: that setup is Company
// Admin's job, done later from the Company Admin portal.
export function EmployeeFormModal({ companyId, brandId, onClose, onCreated }: EmployeeFormModalProps) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createEmployee({ companyId, brandId, name });
      onCreated();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
        setError(err.response.data.error);
      } else {
        setError('Could not add the employee. Please try again.');
      }
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Add Employee" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}
        <Input
          id="employee-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Jane Doe"
        />
        <p className="-mt-2 text-xs text-ink-muted">
          That's all that's needed here — department, designation, shift, and roster are set up by
          the Company Admin afterward.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!name.trim()}>
            Add Employee
          </Button>
        </div>
      </form>
    </Modal>
  );
}

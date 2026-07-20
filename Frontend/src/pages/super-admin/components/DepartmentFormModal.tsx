import { useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { createDepartment, updateDepartment, type Department } from '../../../api/tenancy';

interface DepartmentFormModalProps {
  companyId: string;
  department?: Department;
  onClose: () => void;
  onSaved: () => void;
}

// Trims a comma-separated list, dropping empty entries. Order is preserved
// (not deduped here) so entries in the Name(s) and Code(s) fields still line
// up positionally — de-duplication happens after pairing them.
function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function DepartmentFormModal({ companyId, department, onClose, onSaved }: DepartmentFormModalProps) {
  const isEdit = !!department;
  const [name, setName] = useState(department?.name ?? '');
  const [code, setCode] = useState(department?.code ?? '');
  const [isHrDepartment, setIsHrDepartment] = useState(department?.isHrDepartment ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: string[]; failed: string[] } | null>(null);

  const parsedNames = isEdit ? [] : parseList(name);
  const isBulk = !isEdit && parsedNames.length > 1;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (isEdit) {
      setIsSubmitting(true);
      try {
        await updateDepartment(department.id, { companyId, name, code, isHrDepartment });
        onSaved();
        onClose();
      } catch {
        setError('Could not update the department. Please try again.');
        setIsSubmitting(false);
      }
      return;
    }

    if (parsedNames.length === 0) {
      setError('Enter at least one department name.');
      return;
    }

    if (parsedNames.length === 1) {
      setIsSubmitting(true);
      try {
        await createDepartment({ companyId, name: parsedNames[0], code, isHrDepartment });
        onSaved();
        onClose();
      } catch {
        setError('Could not create the department. Please try again.');
        setIsSubmitting(false);
      }
      return;
    }

    // Bulk path: a code is required per department here — pair names/codes
    // positionally, then drop exact duplicate (name, code) pairs.
    const parsedCodes = parseList(code);
    if (parsedCodes.length !== parsedNames.length) {
      setError(
        `Provide one code for each department name, in the same order (${parsedNames.length} names, ${parsedCodes.length} codes).`
      );
      return;
    }

    const seen = new Set<string>();
    const pairs: { name: string; code: string }[] = [];
    for (let i = 0; i < parsedNames.length; i++) {
      const key = `${parsedNames[i]}|${parsedCodes[i]}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ name: parsedNames[i], code: parsedCodes[i] });
      }
    }

    setIsSubmitting(true);
    const results = await Promise.allSettled(
      pairs.map((pair) => createDepartment({ companyId, name: pair.name, code: pair.code }))
    );
    const created = pairs.filter((_, i) => results[i].status === 'fulfilled').map((p) => p.name);
    const failed = pairs.filter((_, i) => results[i].status === 'rejected').map((p) => p.name);
    onSaved();
    setIsSubmitting(false);
    setSummary({ created, failed });
  }

  if (summary) {
    return (
      <Modal title="Departments created" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={1.5} />
          <p className="text-sm text-ink">
            Created {summary.created.length} of {summary.created.length + summary.failed.length} departments.
          </p>
          {summary.failed.length > 0 && (
            <p className="text-sm text-danger">Failed: {summary.failed.join(', ')}</p>
          )}
          <Button className="mt-2" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={isEdit ? 'Edit Department' : 'Create Department'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <div>
          <Input
            id="department-name"
            label={isEdit ? 'Name' : 'Name(s)'}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={isEdit ? 'Engineering' : 'Engineering, Sales, HR'}
          />
          {!isEdit && (
            <p className="mt-1.5 text-xs text-ink-muted">
              Separate multiple names with commas to create several departments at once.
            </p>
          )}
        </div>
        <div>
          <Input
            id="department-code"
            label={isBulk ? 'Code(s)' : 'Code'}
            required={isBulk}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={isBulk ? 'ENG, SAL, HR' : 'ENG'}
          />
          {isBulk && (
            <p className="mt-1.5 text-xs text-ink-muted">
              Provide one code per name above, in the same order.
            </p>
          )}
        </div>
        {!isBulk && (
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={isHrDepartment}
              onChange={(event) => setIsHrDepartment(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-ink">This is the HR department</span>
              <span className="block text-xs text-ink-muted">
                Every employee assigned here automatically gets holiday and leave balance management access.
              </span>
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? 'Save Changes' : isBulk ? `Create ${parsedNames.length} Departments` : 'Create Department'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

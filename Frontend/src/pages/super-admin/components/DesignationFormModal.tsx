import { useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { createDesignation, updateDesignation, type Designation } from '../../../api/tenancy';

interface DesignationFormModalProps {
  companyId: string;
  designation?: Designation;
  onClose: () => void;
  onSaved: () => void;
}

// Trims and dedupes a comma-separated title list, dropping empty entries —
// used only when creating (not editing), so "Manager, Team Lead, Analyst"
// creates three designations in one submit.
function parseTitles(raw: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      titles.push(trimmed);
    }
  }
  return titles;
}

export function DesignationFormModal({
  companyId,
  designation,
  onClose,
  onSaved,
}: DesignationFormModalProps) {
  const isEdit = !!designation;
  const [title, setTitle] = useState(designation?.title ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: string[]; failed: string[] } | null>(null);

  const parsedTitles = isEdit ? [] : parseTitles(title);
  const isBulk = !isEdit && parsedTitles.length > 1;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (isEdit) {
      setIsSubmitting(true);
      try {
        await updateDesignation(designation.id, { companyId, title, level: null });
        onSaved();
        onClose();
      } catch {
        setError('Could not update the designation. Please try again.');
        setIsSubmitting(false);
      }
      return;
    }

    if (parsedTitles.length === 0) {
      setError('Enter at least one designation title.');
      return;
    }

    if (parsedTitles.length === 1) {
      setIsSubmitting(true);
      try {
        await createDesignation({ companyId, title: parsedTitles[0], level: null });
        onSaved();
        onClose();
      } catch {
        setError('Could not create the designation. Please try again.');
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    const results = await Promise.allSettled(
      parsedTitles.map((t) => createDesignation({ companyId, title: t, level: null }))
    );
    const created = parsedTitles.filter((_, i) => results[i].status === 'fulfilled');
    const failed = parsedTitles.filter((_, i) => results[i].status === 'rejected');
    onSaved();
    setIsSubmitting(false);
    setSummary({ created, failed });
  }

  if (summary) {
    return (
      <Modal title="Designations created" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={1.5} />
          <p className="text-sm text-ink">
            Created {summary.created.length} of {summary.created.length + summary.failed.length} designations.
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
    <Modal title={isEdit ? 'Edit Designation' : 'Create Designation'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <div>
          <Input
            id="designation-title"
            label={isEdit ? 'Title' : 'Title(s)'}
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={isEdit ? 'Software Engineer' : 'Software Engineer, Team Lead, Manager'}
          />
          {!isEdit && (
            <p className="mt-1.5 text-xs text-ink-muted">
              Separate multiple titles with commas to create several designations at once.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? 'Save Changes' : isBulk ? `Create ${parsedTitles.length} Designations` : 'Create Designation'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

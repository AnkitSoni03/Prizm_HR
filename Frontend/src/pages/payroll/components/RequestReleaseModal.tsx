import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../context/toast-context';
import { apiErrorMessage } from '../../../utils/apiError';
import { requestSalaryRelease, type SkippedEmployee } from '../../../api/payroll';

interface Person {
  id: string;
  name: string | null;
  employeeCode?: string | null;
}

// Asks the level that owns these employees' salaries to release them, so the
// caller can put them on their own template. Their current salary keeps
// running until then.
export function RequestReleaseModal({ employees, onClose, onDone }: { employees: Person[]; onClose: () => void; onDone: () => void }) {
  const showToast = useToast();
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<SkippedEmployee[] | null>(null);

  async function handleSend() {
    setIsSaving(true);
    setError(null);
    try {
      const r = await requestSalaryRelease(
        employees.map((e) => String(e.id)),
        reason.trim() || undefined
      );
      if (r.data.length > 0) showToast(`Release requested for ${r.data.length} employee${r.data.length === 1 ? '' : 's'}.`, 'success');
      if (r.skipped.length > 0) setSkipped(r.skipped);
      else onDone();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send the request.'));
    } finally {
      setIsSaving(false);
    }
  }

  if (skipped) {
    return (
      <Modal title="Some were not requested" onClose={onDone} compact>
        <div className="space-y-3 text-sm">
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
            {skipped.map((s) => (
              <li key={s.employeeId} className="flex flex-wrap justify-between gap-x-2">
                <span className="text-ink">{s.name ?? `Employee #${s.employeeId}`}</span>
                <span className="text-warning">{s.reason}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Request salary release" onClose={onClose} compact>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          {employees.length === 1 ? `${employees[0].name ?? 'This employee'}’s` : `These ${employees.length} employees’`} salary was
          assigned at a higher level. Ask them to release {employees.length === 1 ? 'this employee' : 'them'} to you — once
          approved you can assign your own template. The current salary keeps running until you do.
        </p>
        {employees.length > 1 && (
          <ul className="max-h-40 overflow-y-auto rounded-xl border border-border p-2 text-sm text-ink">
            {employees.map((e) => (
              <li key={e.id}>
                {e.name ?? '—'} {e.employeeCode ? `(${e.employeeCode})` : ''}
              </li>
            ))}
          </ul>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Reason (optional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="e.g. Moving them to our brand’s sales template"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} isLoading={isSaving}>Send request</Button>
        </div>
      </div>
    </Modal>
  );
}

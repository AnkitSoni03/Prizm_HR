import { useEffect, useState } from 'react';
import axios from 'axios';
import { ScanFace } from 'lucide-react';
import {
  getEmployeeFaceProfileStatus,
  setEmployeeFaceRetake,
  type FaceProfileStatus,
} from '../api/ess/faceProfile';
import { formatDisplayDateTime } from '../utils/dateDisplay';
import { useAuth } from '../context/auth-context';
import { Badge } from './ui/Badge';
import { Toggle } from './ui/Toggle';

// View of an employee's registered Face ID photo, for admins (Group /
// Company / Brand Admin, HR). Not shown to Super Admin — the backend also
// refuses it (employee.controller.js::getFacePhoto). Admins who can edit the
// employee also get the "Allow Face ID retake" toggle.
export function EmployeeFaceIdCard({ employeeId }: { employeeId: string }) {
  const { user, hasPermission } = useAuth();
  const [status, setStatus] = useState<FaceProfileStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const canManageRetake =
    hasPermission('employee:update') || !!user?.roles.some((role) => role.name === 'Group Admin');

  useEffect(() => {
    let cancelled = false;
    getEmployeeFaceProfileStatus(employeeId)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  async function handleToggle(allowed: boolean) {
    setToggleError(null);
    setSaving(true);
    try {
      setStatus(await setEmployeeFaceRetake(employeeId, allowed));
    } catch (err) {
      setToggleError(
        axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
          ? err.response.data.error
          : 'Could not update the retake setting.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-page px-4 py-3">
      <div className="flex items-center gap-2">
        <ScanFace className="h-4 w-4 text-ink-muted" />
        <p className="text-sm font-medium text-ink">Face ID</p>
        {status?.registered && status.retakeRequestedAt && !status.retakeAllowed && (
          <Badge tone="warning">Retake requested</Badge>
        )}
      </div>

      {failed ? (
        <p className="mt-2 text-xs text-ink-muted">Could not load the Face ID photo.</p>
      ) : status === null ? (
        <p className="mt-2 text-xs text-ink-muted">Loading…</p>
      ) : !status.registered ? (
        <p className="mt-2 text-xs text-ink-muted">This employee has not registered their face yet.</p>
      ) : (
        <div className="mt-3 flex flex-col items-start gap-2">
          {status.photoUrl ? (
            <a href={status.photoUrl} target="_blank" rel="noreferrer" title="Open full size">
              <img
                src={status.photoUrl}
                alt="Registered face"
                className="h-40 w-40 -scale-x-100 rounded-lg border border-border object-cover"
              />
            </a>
          ) : (
            <p className="text-xs text-ink-muted">Registered, but the photo is unavailable right now.</p>
          )}
          {status.registeredAt && (
            <p className="text-xs text-ink-muted">Registered on {formatDisplayDateTime(status.registeredAt)}</p>
          )}
          {status.retakeRequestedAt && !status.retakeAllowed && (
            <p className="text-xs text-ink-muted">
              Retake requested on {formatDisplayDateTime(status.retakeRequestedAt)}
            </p>
          )}

          {canManageRetake && (
            <div className="mt-2 w-full border-t border-border pt-3">
              <Toggle
                checked={status.retakeAllowed}
                onChange={handleToggle}
                disabled={saving}
                label="Allow Face ID retake"
                description={
                  status.retakeAllowed
                    ? 'The employee can re-register their face once. It locks again after they submit.'
                    : 'Off — the employee cannot replace their registered face.'
                }
              />
              {toggleError && <p className="mt-2 text-xs text-danger">{toggleError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

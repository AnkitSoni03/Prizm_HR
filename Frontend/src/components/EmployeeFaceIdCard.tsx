import { useEffect, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { getEmployeeFaceProfileStatus, type FaceProfileStatus } from '../api/ess/faceProfile';
import { formatDisplayDateTime } from '../utils/dateDisplay';

// Read-only view of an employee's registered Face ID photo, for admins
// (Group / Company / Brand Admin, HR). Not shown to Super Admin — the
// backend also refuses it (employee.controller.js::getFacePhoto).
export function EmployeeFaceIdCard({ employeeId }: { employeeId: string }) {
  const [status, setStatus] = useState<FaceProfileStatus | null>(null);
  const [failed, setFailed] = useState(false);

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

  return (
    <div className="rounded-xl border border-border bg-page px-4 py-3">
      <div className="flex items-center gap-2">
        <ScanFace className="h-4 w-4 text-ink-muted" />
        <p className="text-sm font-medium text-ink">Face ID</p>
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
        </div>
      )}
    </div>
  );
}

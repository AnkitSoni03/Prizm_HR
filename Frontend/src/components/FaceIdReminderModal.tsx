import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanFace } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useAuth } from '../context/auth-context';
import { getMyFaceProfileStatus } from '../api/ess/faceProfile';

// Mounted once in Layout (portal-agnostic, same as HolidayReminderModal /
// NotificationBell) so it fires right after login for every portal, but only
// ever actually shows for an Employee (face_profile:register is Employee-only
// — see CLAUDE.md's RBAC seed) who hasn't registered a face profile yet.
// Deliberately has no persistent "dismiss forever" — attendance in this
// system is face-recognition-only with no fallback punch, so an employee who
// skips this keeps getting reminded on every fresh login/app load until they
// actually register, same trigger cadence as the holiday reminder.
export function FaceIdReminderModal() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user || !hasPermission('face_profile:register')) return;

    getMyFaceProfileStatus()
      .then((status) => setShow(!status.registered))
      .catch(() => {
        /* non-critical — the employee can still find Face ID under Settings */
      });
    // Deliberately only re-checks when the signed-in user changes (fresh
    // login/app load), not on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!show) return null;

  function handleRegisterNow() {
    setShow(false);
    navigate('/ess/settings?tab=face');
  }

  return (
    <Modal title="Face ID Registration Required" onClose={() => setShow(false)} widthClassName="max-w-sm">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
          <ScanFace className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-sm text-ink">
            This software records attendance using face recognition at the kiosk. You haven't
            registered your Face ID yet.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Please go to <span className="font-medium text-ink">Settings → Face ID</span> and
            register yourself so you can check in and out.
          </p>
        </div>
        <div className="flex w-full gap-2">
          <Button type="button" variant="secondary" onClick={() => setShow(false)} className="flex-1">
            Remind me later
          </Button>
          <Button type="button" onClick={handleRegisterNow} className="flex-1">
            Register now
          </Button>
        </div>
      </div>
    </Modal>
  );
}

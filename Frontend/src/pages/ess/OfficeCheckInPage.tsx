import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { startAuthentication } from '@simplewebauthn/browser';
import { QrCode, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { verifyOfficeBiometric, verifyOfficeQr } from '../../api/ess/officeAttendance';

const SCANNER_ELEMENT_ID = 'office-qr-reader';

type Step = 'scan' | 'verifying' | 'success' | 'failure';

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

// Employee side of the office kiosk flow: scan the kiosk's rotating QR, then
// confirm with the device passkey registered on the Settings > Office
// Check-In Device tab. Any failure here is a dead end by design (CLAUDE.md
// rule 6: QR-only attendance, no fallback punch) — the employee is pointed
// at the regularization request flow instead of being offered a retry that
// bypasses the passkey.
export function OfficeCheckInPage() {
  const [action, setAction] = useState<'checkin' | 'checkout'>('checkin');
  const [step, setStep] = useState<Step>('scan');
  const [message, setMessage] = useState<string | null>(null);
  const [isTabVisible, setIsTabVisible] = useState(!document.hidden);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isHandlingScanRef = useRef(false);
  // Captured directly from the <video> element right after the scanner
  // starts, independent of the DOM — see stopScanner below for why this is
  // needed in addition to the library's own stop()/clear().
  const streamRef = useRef<MediaStream | null>(null);

  // Switching browser tabs doesn't unmount this page or change `step` on
  // its own — without this, the camera would just keep streaming in the
  // background tab indefinitely. Tie the scanner effect below to tab
  // visibility so it actually releases the camera when you switch away and
  // starts fresh again when you switch back.
  useEffect(() => {
    function handleVisibilityChange() {
      setIsTabVisible(!document.hidden);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        // html5-qrcode's stop()/clear() can throw partway through if the
        // container DOM node it manages changed state around the same time
        // (e.g. React removing it during a route change) — when that
        // happens it can bail out *before* actually releasing the camera
        // hardware, silently leaving the camera light on. Swallow it here
        // and fall through to the manual track-stop below regardless,
        // since that's what actually controls the hardware.
      }
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const handleScan = useCallback(
    async (officeToken: string) => {
      await stopScanner();
      setStep('verifying');
      setMessage(null);

      try {
        const { pendingAttendanceId, assertionOptions } = await verifyOfficeQr(officeToken, action);
        const assertion = await startAuthentication({ optionsJSON: assertionOptions as never });
        const result = await verifyOfficeBiometric(pendingAttendanceId, assertion);
        setMessage(result.action === 'check_in' ? 'Checked in successfully.' : 'Checked out successfully.');
        setStep('success');
      } catch (err) {
        setMessage(extractError(err, 'Could not complete your check-in/out.'));
        setStep('failure');
      }
    },
    [action, stopScanner]
  );

  useEffect(() => {
    if (step !== 'scan' || !isTabVisible) return;

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;
    isHandlingScanRef.current = false;
    let cancelled = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          if (isHandlingScanRef.current) return;
          isHandlingScanRef.current = true;
          handleScan(decodedText);
        },
        () => {
          // Per-frame "no QR found yet" — expected constantly, not an error.
        }
      )
      .then(() => {
        // Capture the raw MediaStream now, while the container is
        // definitely still in the DOM — stopScanner() may run later from a
        // context (unmount/route change) where querying the DOM for it
        // would be too late or unreliable.
        const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_ELEMENT_ID} video`);
        if (video?.srcObject instanceof MediaStream) {
          streamRef.current = video.srcObject;
        }

        // The effect was already cleaned up (e.g. React StrictMode's
        // dev-only double-invoke firing mount → cleanup → mount) before
        // start() resolved — stop it now instead of leaving the camera
        // running orphaned.
        if (cancelled) stopScanner();
      })
      .catch(() => {
        if (!cancelled) setMessage('Could not access the camera. Check permissions and try again.');
      });

    // stopScanner already wraps scanner.stop()/clear() in try/catch —
    // html5-qrcode throws *synchronously* (not a rejected promise) when
    // asked to stop a scanner that isn't fully running yet, which a bare
    // `scanner.stop().catch(...)` here would miss entirely (the throw
    // happens before the promise chain attaches) and crash the whole tree,
    // exactly the "Cannot stop, scanner is not running or paused" bug hit
    // in testing.
    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [step, isTabVisible, handleScan, stopScanner]);

  function reset() {
    setStep('scan');
    setMessage(null);
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 w-full sm:w-56">
        <Select
          id="office-action"
          label="I want to"
          value={action}
          onChange={(event) => setAction(event.target.value as 'checkin' | 'checkout')}
          options={[
            { value: 'checkin', label: 'Check In' },
            { value: 'checkout', label: 'Check Out' },
          ]}
          disabled={step !== 'scan'}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        {step === 'scan' && (
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <QrCode className="h-4 w-4" strokeWidth={2} />
              Scan the office kiosk QR
            </div>
            <div id={SCANNER_ELEMENT_ID} className="overflow-hidden rounded-xl" />
            {message && <p className="mt-3 text-sm text-danger">{message}</p>}
          </div>
        )}

        {step === 'verifying' && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-ink-muted">
            Confirm with your device passkey when prompted…
          </div>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2} />
            <p className="text-sm font-semibold text-ink">{message}</p>
            <Button variant="secondary" onClick={reset}>
              Scan again
            </Button>
          </div>
        )}

        {step === 'failure' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <XCircle className="h-10 w-10 text-danger" strokeWidth={2} />
            <p className="text-sm font-semibold text-ink">{message}</p>
            <p className="text-sm text-ink-muted">
              If this keeps happening, raise a{' '}
              <Link to="/ess/attendance?tab=requests" className="font-medium text-primary hover:underline">
                correction request
              </Link>{' '}
              instead.
            </p>
            <Button variant="secondary" onClick={reset}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { Camera, LogIn, LogOut } from 'lucide-react';
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness';
import { ThemeProvider, type Theme } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useAuth } from '../../context/auth-context';
import { configureAmplify } from '../../lib/amplifyConfig';
import { createFaceLivenessSession, faceCheckIn, uploadFaceCapture } from '../../api/kiosk';

const AWS_REGION = import.meta.env.VITE_AWS_REGION;

// AWS's own component ships a light theme by default, which clashes with
// this page's dark kiosk shell — same brand colors as index.css's dark-mode
// tokens (--bg-sidebar/--bg-card/--brand there), duplicated here as plain
// hex since Amplify's ThemeProvider doesn't read this app's CSS variables.
const LIVENESS_THEME: Theme = {
  name: 'kiosk-dark',
  tokens: {
    colors: {
      background: {
        primary: { value: '#0c0c0f' },
        secondary: { value: '#17181d' },
      },
      font: {
        primary: { value: '#ffffff' },
        secondary: { value: '#9ca3af' },
      },
      brand: {
        primary: {
          10: { value: '#1e3c72' },
          80: { value: '#3354a4' },
          90: { value: '#3354a4' },
          100: { value: '#3354a4' },
        },
      },
    },
  },
};

type KioskState =
  | { phase: 'ready' }
  | { phase: 'starting'; action: 'checkin' | 'checkout' }
  | { phase: 'liveness'; action: 'checkin' | 'checkout'; sessionId: string }
  | { phase: 'matching'; action: 'checkin' | 'checkout' }
  | { phase: 'success'; message: string }
  | { phase: 'error'; message: string }
  // The employee tried to check out before their shift's hours were up —
  // reused across confirm-in-progress too (isConfirming), rather than a
  // separate 'matching' detour, so the OK/Wait buttons stay visible with a
  // disabled state instead of the dialog disappearing mid-confirm.
  | { phase: 'confirm_incomplete_shift'; message: string; isConfirming: boolean };

// checkInTime/checkOutTime/workedMinutes/requiredMinutes are only present
// for the specific attendance-state error codes below (see
// attendance.service.js::applyAttendancePunch). Every other rejection
// (unknown face, liveness failed) has none of these.
interface FaceCheckInErrorDetails {
  message: string;
  code?: string;
  checkInTime?: string;
  checkOutTime?: string;
  workedMinutes?: number;
  requiredMinutes?: number;
}

function extractErrorDetails(err: unknown, fallback: string): FaceCheckInErrorDetails {
  if (axios.isAxiosError(err) && err.response?.data) {
    const data = err.response.data as Omit<FaceCheckInErrorDetails, 'message'> & { error?: string };
    return {
      ...data,
      message: typeof data.error === 'string' ? data.error : fallback,
    };
  }
  return { message: fallback };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Fullscreen, no Layout/Sidebar/Topbar chrome — a physical kiosk device logs
// in once as a dedicated Scanner account and is meant to stay on this screen
// indefinitely. Deliberately outside ProtectedRoute's normal portal shell
// (see AppRoutes.tsx) since a kiosk has no use for navigation, a
// notification bell, or any of the rest of the app chrome.
//
// Face identification and liveness/anti-spoof detection both run on AWS
// (Rekognition + Face Liveness) — AWS's own <FaceLivenessDetector> component
// owns the camera for the actual liveness challenge and streams straight to
// AWS; this page never sees the raw liveness video. A second, independent
// getUserMedia capture runs alongside it purely to keep the existing 90-day
// audit-clip trail (attendanceVideoCleanup.job.js) working unchanged — most
// browsers happily support two concurrent consumers of the same camera on
// one page, and this capture is best-effort (never blocks a punch if it
// fails to start).
export function KioskPage() {
  const { isAuthenticated, logout } = useAuth();

  const [state, setState] = useState<KioskState>({ phase: 'ready' });
  const auditRef = useRef<{ stream: MediaStream; recorder: MediaRecorder; chunks: BlobPart[] } | null>(null);
  // Everything needed to resubmit the exact same checkout attempt with
  // confirmIncompleteShift: true after the employee taps "Check Out Anyway"
  // — the liveness session is still valid, so this reuses it rather than
  // making the employee redo the liveness challenge a second time.
  const pendingCheckoutRef = useRef<{ sessionId: string; blob: Blob | null } | null>(null);
  // Auto-cancels the liveness screen if the employee never completes the
  // challenge (walks away, gets confused, etc.) — a kiosk must not sit
  // waiting on one attempt indefinitely. Cleared any time the liveness phase
  // ends on its own (analysis completes or AWS reports an error) so it never
  // fires after the fact.
  const livenessTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    configureAmplify();
    return () => {
      if (livenessTimeoutRef.current) window.clearTimeout(livenessTimeoutRef.current);
    };
  }, []);

  function clearLivenessTimeout() {
    if (livenessTimeoutRef.current) {
      window.clearTimeout(livenessTimeoutRef.current);
      livenessTimeoutRef.current = null;
    }
  }

  async function startAuditRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.start();
      auditRef.current = { stream, recorder, chunks };
    } catch (err) {
      console.error('Audit clip recording could not start (non-blocking):', err);
      auditRef.current = null;
    }
  }

  function stopAuditRecording(): Promise<Blob | null> {
    const audit = auditRef.current;
    auditRef.current = null;
    if (!audit) return Promise.resolve(null);
    return new Promise((resolve) => {
      audit.recorder.onstop = () => {
        audit.stream.getTracks().forEach((track) => track.stop());
        resolve(new Blob(audit.chunks, { type: audit.recorder.mimeType || 'video/webm' }));
      };
      audit.recorder.stop();
    });
  }

  const handleLivenessTimeout = useCallback(async () => {
    clearLivenessTimeout();
    await stopAuditRecording();
    setState({ phase: 'error', message: 'Face verification timed out. Please try again.' });
    setTimeout(() => setState({ phase: 'ready' }), 3000);
  }, []);

  const runCapture = useCallback(
    async (action: 'checkin' | 'checkout') => {
      setState({ phase: 'starting', action });
      try {
        const session = await createFaceLivenessSession();
        // Fire-and-forget: this opens a second, independent camera stream
        // purely for our own audit clip (see the class comment above) — it
        // was previously awaited here, which meant the employee stared at a
        // blank "Preparing camera…" screen until a SECOND getUserMedia
        // handshake finished, on top of AWS's own liveness camera. It's
        // best-effort by design (startAuditRecording already swallows its
        // own errors), so there's no reason to block AWS's UI on it.
        startAuditRecording();
        setState({ phase: 'liveness', action, sessionId: session.sessionId });
        // AWS's own flow (get-ready screen -> centering -> the actual
        // light-flash challenge -> analysis) routinely takes well past 10s
        // end to end even for a cooperative user — 10s (copied from the old
        // custom challenge's much shorter flow) was firing before a normal
        // attempt could ever finish. 35s comfortably covers the real flow
        // while still guaranteeing the kiosk never hangs indefinitely.
        livenessTimeoutRef.current = window.setTimeout(() => {
          handleLivenessTimeout();
        }, 35000);
      } catch {
        setState({ phase: 'error', message: 'Could not start face verification. Please try again.' });
        setTimeout(() => setState({ phase: 'ready' }), 3000);
      }
    },
    [handleLivenessTimeout]
  );

  const completeLiveness = useCallback(async (action: 'checkin' | 'checkout', sessionId: string) => {
    clearLivenessTimeout();
    const blob = await stopAuditRecording();
    setState({ phase: 'matching', action });
    try {
      const result = await faceCheckIn(action, sessionId);
      setState({
        phase: 'success',
        message: `Welcome, ${result.employee.name} — ${result.action === 'check_in' ? 'Checked In' : 'Checked Out'}`,
      });
      if (blob) {
        uploadFaceCapture(result.attendance.id, action, blob).catch((err) =>
          console.error('Face capture upload failed:', err)
        );
      }
      setTimeout(() => setState({ phase: 'ready' }), 3000);
    } catch (err) {
      const details = extractErrorDetails(err, 'Face not recognized. Please try again.');

      if (details.code === 'SHIFT_INCOMPLETE') {
        pendingCheckoutRef.current = { sessionId, blob };
        setState({ phase: 'confirm_incomplete_shift', message: details.message, isConfirming: false });
        return;
      }
      if (details.code === 'ALREADY_CHECKED_IN' && details.checkInTime) {
        setState({ phase: 'error', message: `Already Checked-In at ${formatTime(details.checkInTime)}` });
      } else if (details.code === 'ALREADY_CHECKED_OUT' && details.checkOutTime) {
        setState({ phase: 'error', message: `Already Checked-Out at ${formatTime(details.checkOutTime)}` });
      } else {
        setState({ phase: 'error', message: details.message });
      }
      setTimeout(() => setState({ phase: 'ready' }), 3000);
    }
  }, []);

  const handleLivenessError = useCallback(async () => {
    clearLivenessTimeout();
    await stopAuditRecording();
    setState({ phase: 'error', message: 'Face verification was interrupted. Please try again.' });
    setTimeout(() => setState({ phase: 'ready' }), 3000);
  }, []);

  // "Check Out Anyway" on the SHIFT_INCOMPLETE confirmation — resubmits with
  // the same already-verified liveness session, just with
  // confirmIncompleteShift: true, rather than reopening the camera.
  const confirmCheckoutAnyway = useCallback(async () => {
    const pending = pendingCheckoutRef.current;
    if (!pending) return;

    setState((prev) => (prev.phase === 'confirm_incomplete_shift' ? { ...prev, isConfirming: true } : prev));
    try {
      const result = await faceCheckIn('checkout', pending.sessionId, true);
      setState({ phase: 'success', message: `Welcome, ${result.employee.name} — Checked Out` });
      if (pending.blob) {
        uploadFaceCapture(result.attendance.id, 'checkout', pending.blob).catch((err) =>
          console.error('Face capture upload failed:', err)
        );
      }
    } catch (err) {
      const { message } = extractErrorDetails(err, 'Could not check out. Please try again.');
      setState({ phase: 'error', message });
    } finally {
      pendingCheckoutRef.current = null;
      setTimeout(() => setState({ phase: 'ready' }), 3000);
    }
  }, []);

  // "Wait" — the employee isn't ready to leave yet; discard the pending
  // checkout entirely and go straight back to ready, no attendance write.
  function dismissIncompleteShiftCheckout() {
    pendingCheckoutRef.current = null;
    setState({ phase: 'ready' });
  }

  // No separate "Kiosk Sign In" form anymore — bounces to the same /login
  // page every other portal uses, carrying `from: /kiosk` so LoginPage's own
  // resolveRedirectTarget sends a Scanner account straight back here after
  // signing in (Scanner's own default route is already /kiosk, see
  // roleRedirect.ts), instead of stranding the device on a bespoke form.
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: { pathname: '/kiosk' } }} replace />;
  }

  const canLogout = state.phase === 'ready' || state.phase === 'error' || state.phase === 'success';

  return (
    <div className="relative flex h-screen w-full flex-col items-center overflow-x-hidden bg-sidebar px-3 py-[10vh] text-center sm:px-4">
      <button
        type="button"
        onClick={() => canLogout && logout()}
        disabled={!canLogout}
        title="Sign out this kiosk"
        className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/50 hover:bg-white/10 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-30 sm:right-4 sm:top-4"
      >
        <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
        <span className="hidden sm:inline">Sign out kiosk</span>
      </button>

      <div className="flex w-full max-w-xl flex-1 flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-2xl sm:max-w-2xl sm:gap-5 sm:p-8 lg:max-w-3xl">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <img src="/HRMS%20Logo.png" alt="HRMS logo" className="h-10 w-10 rounded-lg object-cover sm:h-12 sm:w-12" />
          <p className="text-[11px] text-white/60 sm:mt-1 sm:text-sm">Choose Check In or Check Out, then follow the on-screen instructions</p>
        </div>

        <div className="relative w-full min-h-0 flex-1 overflow-hidden rounded-2xl bg-black shadow-xl ring-1 ring-white/10">
          {state.phase === 'ready' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-black/70 to-black/85 text-white">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <Camera className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <p className="max-w-[85%] text-sm text-white/70">Camera is off — choose an option below</p>
            </div>
          )}

          {state.phase === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white">
              Preparing camera…
            </div>
          )}

          {state.phase === 'liveness' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white">
              Starting…
            </div>
          )}

          {state.phase === 'matching' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white">
              Verifying…
            </div>
          )}

          {state.phase === 'success' && (
            <div className="absolute inset-0 flex items-center justify-center bg-success/90 px-6 text-center text-lg font-semibold text-white">
              {state.message}
            </div>
          )}

          {state.phase === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-danger/90 px-6 text-center text-sm font-semibold text-white">
              {state.message}
            </div>
          )}

          {state.phase === 'confirm_incomplete_shift' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 px-4 text-center sm:px-6">
              <p className="text-sm font-semibold text-white">{state.message}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={confirmCheckoutAnyway}
                  disabled={state.isConfirming}
                  className="rounded-xl bg-danger px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {state.isConfirming ? 'Checking Out…' : 'OK, Check Out'}
                </button>
                <button
                  type="button"
                  onClick={dismissIncompleteShiftCheckout}
                  disabled={state.isConfirming}
                  className="rounded-xl bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
                >
                  Wait
                </button>
              </div>
            </div>
          )}
        </div>

        {state.phase === 'ready' && (
          <div className="flex w-full shrink-0 justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => runCapture('checkin')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 sm:py-3"
            >
              <LogIn className="h-4 w-4" strokeWidth={2} />
              Check In
            </button>
            <button
              type="button"
              onClick={() => runCapture('checkout')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 sm:py-3"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
              Check Out
            </button>
          </div>
        )}
      </div>

      {/* Rendered as a full-viewport overlay, not confined to the camera box
          above — AWS's own UI (photosensitivity banner + instructions + oval
          guide) needs more height than that box has, and was getting clipped
          by its overflow-hidden. The backdrop is `fixed` (escapes that
          regardless of the box's own size), but the component itself sits in
          a moderately-sized, capped box — AWS scales its oval guide to fill
          whatever container it's given, so handing it the full physical
          screen (tried first) made the oval comically oversized on a large
          monitor. AWS's own guidance is to never resize the oval itself via
          CSS since that affects liveness accuracy — sizing the *container*
          reasonably is the correct way to control this. */}
      {state.phase === 'liveness' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-[#0c0c0f]" style={{ height: '600px', maxHeight: '85vh' }}>
            <ThemeProvider theme={LIVENESS_THEME}>
              <FaceLivenessDetector
                sessionId={state.sessionId}
                region={AWS_REGION}
                onAnalysisComplete={() => completeLiveness(state.action, state.sessionId)}
                onError={handleLivenessError}
                disableStartScreen
              />
            </ThemeProvider>
          </div>
        </div>
      )}
    </div>
  );
}

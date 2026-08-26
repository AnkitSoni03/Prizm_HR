import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { LogIn, LogOut } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { detectFaceOptions, smileRatio, faceapi, estimateYaw, loadFaceApiModels } from '../../lib/faceapi';
import {
  faceCheckIn,
  uploadFaceCapture,
  uploadFaceFlagCapture,
  type FrameBbox,
  type LivenessChallenge,
  type LivenessFrame,
} from '../../api/kiosk';

const CHALLENGES: { key: LivenessChallenge; instruction: string }[] = [
  { key: 'smile', instruction: 'Please smile' },
  { key: 'turn_left', instruction: 'Please turn your head left' },
  { key: 'turn_right', instruction: 'Please turn your head right' },
];

// The person has up to 10s to actually perform the challenge — sampling
// stops the instant it's detected (usually well before that), so a quick
// smile/turn doesn't force anyone to sit through the full window. If
// nothing is detected by the deadline, capture is abandoned with a timeout
// message rather than sending a burst to the backend that we already know
// didn't satisfy the challenge.
const MAX_CAPTURE_MS = 10000;
const SAMPLE_INTERVAL_MS = 120;
const CAMERA_WARMUP_MS = 150;

// Mirrors faceAttendance.service.js::validateLiveness's own thresholds —
// this client-side copy is only used to decide *when to stop sampling
// early*; the backend re-validates the same thing from the raw numbers
// independently and is the actual authority (never trusts a client-side
// "passed" claim).
const MIN_FRAMES = 8;
const MIN_BURST_MS = 1200;
// Uncalibrated (no labelled sample set in this environment) — set to a
// moderate rise in mouth-width/jaw-width ratio, loose enough for a small
// smile to register rather than requiring a wide grin.
const SMILE_DELTA_THRESHOLD = 0.06;
const YAW_DELTA_THRESHOLD = 12;

function isChallengeSatisfied(challenge: LivenessChallenge, frames: LivenessFrame[]): boolean {
  if (frames.length < MIN_FRAMES) return false;
  if (frames[frames.length - 1].t - frames[0].t < MIN_BURST_MS) return false;

  if (challenge === 'smile') {
    const smiles = frames.map((f) => f.smile);
    const baseline = smiles[0];
    return Math.max(...smiles) - baseline >= SMILE_DELTA_THRESHOLD;
  }

  const yaws = frames.map((f) => f.yaw);
  const baseline = yaws[0];
  const extremum = challenge === 'turn_left' ? Math.min(...yaws) : Math.max(...yaws);
  return Math.abs(extremum - baseline) >= YAW_DELTA_THRESHOLD;
}

type KioskState =
  | {
      phase: 'capturing';
      action: 'checkin' | 'checkout';
      challenge: LivenessChallenge;
      instruction: string;
      secondsLeft: number;
    }
  | { phase: 'ready' }
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
// attendance.service.js::applyAttendancePunch); flagId only for a blocked
// anti-spoof rejection. Every other rejection (unknown face, liveness
// challenge failed) has none of these.
interface FaceCheckInErrorDetails {
  message: string;
  code?: string;
  flagId?: string;
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
// notification bell, or any of the rest of the app chrome. Face recognition
// happens directly on this device's own camera — no employee phone, QR
// code, or WebAuthn passkey involved at all.
//
// The camera is only ever open for the duration of one capture burst: it
// opens the instant Check In/Check Out is tapped and is stopped again as
// soon as the descriptor + liveness frames are captured, before the
// network round-trip even starts — it never sits on in the background.
export function KioskPage() {
  const { isAuthenticated, logout } = useAuth();

  const [modelsReady, setModelsReady] = useState(false);
  const [state, setState] = useState<KioskState>({ phase: 'ready' });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Everything needed to resubmit the exact same checkout attempt with
  // confirmIncompleteShift: true after the employee taps "Check Out Anyway"
  // — set right before the first faceCheckIn call, so confirming doesn't
  // require the employee to redo the liveness challenge in front of the
  // camera a second time. Cleared once the confirm dialog resolves either
  // way (confirm or Wait).
  const pendingCheckoutRef = useRef<{
    descriptor: number[];
    liveness: { challenge: LivenessChallenge; frames: LivenessFrame[] };
    frameImage?: string;
    frameBbox?: FrameBbox;
    blob: Blob;
  } | null>(null);

  useEffect(() => {
    loadFaceApiModels()
      .then(() => setModelsReady(true))
      .catch(() => setState({ phase: 'error', message: 'Could not load face recognition models.' }));
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  const runCapture = useCallback(async (action: 'checkin' | 'checkout') => {
    const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    setState({
      phase: 'capturing',
      action,
      challenge: challenge.key,
      instruction: challenge.instruction,
      secondsLeft: Math.ceil(MAX_CAPTURE_MS / 1000),
    });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      setState({ phase: 'error', message: 'Could not access the camera.' });
      setTimeout(() => setState({ phase: 'ready' }), 3000);
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
    // Brief settle so the sensor has a real frame before sampling starts.
    await new Promise((resolve) => setTimeout(resolve, CAMERA_WARMUP_MS));

    const frames: LivenessFrame[] = [];
    const startedAt = Date.now();
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();

    // Landmarks only while watching for the action — the recognition
    // descriptor is the expensive step, computed once at the end, not on
    // every sampled frame. Stops the instant the challenge is satisfied
    // (usually well under 10s); only runs the full window if the person
    // never performs it.
    let satisfied = false;
    while (Date.now() - startedAt < MAX_CAPTURE_MS) {
      if (!videoRef.current) break;
      const elapsed = Date.now() - startedAt;
      const result = await faceapi.detectSingleFace(videoRef.current, detectFaceOptions()).withFaceLandmarks();
      if (result) {
        frames.push({ t: elapsed, smile: smileRatio(result.landmarks), yaw: estimateYaw(result.landmarks) });
      }
      setState((prev) =>
        prev.phase === 'capturing'
          ? { ...prev, secondsLeft: Math.max(0, Math.ceil((MAX_CAPTURE_MS - elapsed) / 1000)) }
          : prev
      );
      if (isChallengeSatisfied(challenge.key, frames)) {
        satisfied = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
    }

    if (!satisfied) {
      recorder.stop();
      await stopped;
      stopCamera();
      setState({ phase: 'error', message: 'No action detected within 10 seconds. Please try again.' });
      setTimeout(() => setState({ phase: 'ready' }), 3000);
      return;
    }

    let descriptor: Float32Array | null = null;
    // Captured from the same video element, at the same instant as the
    // descriptor, so the anti-spoof/screen-artifact check on the backend
    // (antiSpoof.service.js, screenArtifact.service.js) looks at the exact
    // frame the recognition match was made from.
    let frameImage: string | undefined;
    let frameBbox: FrameBbox | undefined;
    if (videoRef.current) {
      const finalResult = await faceapi
        .detectSingleFace(videoRef.current, detectFaceOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
      descriptor = finalResult?.descriptor ?? null;

      if (finalResult) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          frameImage = canvas.toDataURL('image/jpeg', 0.85);
          const box = finalResult.detection.box;
          frameBbox = {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        }
      }
    }

    recorder.stop();
    await stopped;

    // Camera is no longer needed once the descriptor + liveness frames are
    // captured — turn it off now, before the network round-trip, not after.
    stopCamera();

    if (!descriptor) {
      setState({ phase: 'error', message: 'Could not detect a face. Please try again.' });
      setTimeout(() => setState({ phase: 'ready' }), 3000);
      return;
    }

    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });

    // Suppressed only when this attempt lands on the "check out anyway?"
    // confirmation instead of a normal terminal state — that dialog waits
    // on the employee's own OK/Wait tap, not a timer.
    let autoResetToReady = true;

    setState({ phase: 'matching', action });
    try {
      const result = await faceCheckIn(
        action,
        Array.from(descriptor),
        { challenge: challenge.key, frames },
        frameImage,
        frameBbox
      );
      setState({
        phase: 'success',
        message: `Welcome, ${result.employee.name} — ${result.action === 'check_in' ? 'Checked In' : 'Checked Out'}`,
      });

      uploadFaceCapture(result.attendance.id, action, blob).catch((err) =>
        console.error('Face capture upload failed:', err)
      );
    } catch (err) {
      const details = extractErrorDetails(err, 'Face not recognized. Please try again.');

      if (details.code === 'SHIFT_INCOMPLETE') {
        // Keep everything needed to resubmit as a confirmed checkout — the
        // employee shouldn't have to redo the liveness challenge just to
        // say "yes, check me out anyway".
        pendingCheckoutRef.current = { descriptor: Array.from(descriptor), liveness: { challenge: challenge.key, frames }, frameImage, frameBbox, blob };
        setState({ phase: 'confirm_incomplete_shift', message: details.message, isConfirming: false });
        autoResetToReady = false;
      } else if (details.code === 'ALREADY_CHECKED_IN' && details.checkInTime) {
        setState({ phase: 'error', message: `Already Checked-In at ${formatTime(details.checkInTime)}` });
      } else if (details.code === 'ALREADY_CHECKED_OUT' && details.checkOutTime) {
        setState({ phase: 'error', message: `Already Checked-Out at ${formatTime(details.checkOutTime)}` });
      } else {
        setState({ phase: 'error', message: details.message });
      }

      // Blocked anti-spoof attempt — preserve the capture clip against the
      // flag record so an admin can review it on the Fraud Attempts page,
      // same as a normal successful check-in always preserves its clip.
      if (details.code === 'SPOOF_DETECTED' && details.flagId) {
        uploadFaceFlagCapture(details.flagId, blob).catch((uploadErr) =>
          console.error('Fraud attempt capture upload failed:', uploadErr)
        );
      }
    } finally {
      if (autoResetToReady) setTimeout(() => setState({ phase: 'ready' }), 3000);
    }
  }, []);

  // "Check Out Anyway" on the SHIFT_INCOMPLETE confirmation — resubmits the
  // exact same descriptor/liveness/frame data already captured, just with
  // confirmIncompleteShift: true, rather than reopening the camera.
  const confirmCheckoutAnyway = useCallback(async () => {
    const pending = pendingCheckoutRef.current;
    if (!pending) return;

    setState((prev) => (prev.phase === 'confirm_incomplete_shift' ? { ...prev, isConfirming: true } : prev));
    try {
      const result = await faceCheckIn(
        'checkout',
        pending.descriptor,
        pending.liveness,
        pending.frameImage,
        pending.frameBbox,
        true
      );
      setState({ phase: 'success', message: `Welcome, ${result.employee.name} — Checked Out` });
      uploadFaceCapture(result.attendance.id, 'checkout', pending.blob).catch((err) =>
        console.error('Face capture upload failed:', err)
      );
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
    <div className="relative flex h-screen w-full flex-col items-center gap-2 overflow-x-hidden bg-sidebar px-4 py-3 text-center sm:gap-4 sm:px-6 sm:py-4">
      {/* Lets whoever set up this device sign the kiosk account out again —
          without this, a kiosk logged in once would stay signed in
          indefinitely (stateless refresh tokens, per CLAUDE.md, no longer
          expire early on their own). Disabled mid-capture/matching so a stray
          tap can't abandon an in-flight check-in/out. */}
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

      <div className="flex w-full max-w-[560px] shrink-0 flex-col items-center pt-5 sm:pt-0">
        <img src="/HRMS%20Logo.png" alt="HRMS logo" className="h-10 w-10 rounded-lg object-cover sm:h-12 sm:w-12" />
        <p className="text-[11px] text-white/60 sm:mt-1 sm:text-sm">Choose Check In or Check Out, then look at the camera</p>
      </div>

      {/* flex-1 (instead of a fixed aspect ratio) so the preview claims
          whatever vertical space the header/buttons leave on the actual
          device screen, rather than a fixed small box that wastes most of a
          tall kiosk/phone screen. */}
      <div className="relative flex w-full min-h-[220px] max-w-[560px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black shadow-xl">
        {/* Mirrored (-scale-x-100) so the preview behaves like a normal
            mirror — move your head left, the picture moves left — instead
            of the camera's raw, unmirrored feed which looks reversed to
            whoever's standing in front of it. Purely a display transform:
            face-api.js's detection, the captured descriptor/snapshot, and
            the recorded clip all read the video element's actual decoded
            frame buffer, which CSS transforms never touch. */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-cover"
        />

        {state.phase === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">
            {modelsReady ? 'Camera is off — choose an option below' : 'Loading face recognition…'}
          </div>
        )}

        {state.phase === 'capturing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
            <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white">
              {state.instruction}
            </span>
            <span className="text-xs text-white/80">{state.secondsLeft}s left</span>
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
        <div className="flex w-full max-w-[560px] shrink-0 justify-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => runCapture('checkin')}
            disabled={!modelsReady}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 sm:flex-none sm:px-6 sm:py-3"
          >
            <LogIn className="h-4 w-4" strokeWidth={2} />
            Check In
          </button>
          <button
            type="button"
            onClick={() => runCapture('checkout')}
            disabled={!modelsReady}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 sm:flex-none sm:px-6"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            Check Out
          </button>
        </div>
      )}
    </div>
  );
}

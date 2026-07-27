import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { issueOfficeToken, issueSseTicket, uploadOfficeVideo, videoStreamUrl } from '../../api/kiosk';

const TOKEN_POLL_INTERVAL_MS = 12000;
const RECORDING_DURATION_MS = 4000;
const STREAM_RECONNECT_DELAY_MS = 3000;

type CaptureState =
  | { phase: 'idle' }
  | { phase: 'countdown'; recordId: string; action: string; secondsLeft: number }
  | { phase: 'recording'; recordId: string; action: string }
  | { phase: 'uploading' }
  | { phase: 'done' };

// Fullscreen, no Layout/Sidebar/Topbar chrome — a physical kiosk device logs
// in once as a dedicated Scanner account and is meant to stay on this
// screen indefinitely. Deliberately outside ProtectedRoute's normal portal
// shell (see AppRoutes.tsx) since a kiosk has no use for navigation, a
// notification bell, or any of the rest of the app chrome.
export function KioskPage() {
  const { user, isAuthenticated, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [officeToken, setOfficeToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureState>({ phase: 'idle' });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      await login(email, password);
    } catch {
      setLoginError('Invalid email or password for this kiosk account.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  // Rotating QR token — polled on an interval rather than tied to the
  // token's own TTL, same pattern as NotificationBell.tsx's unread-count
  // poll (no websocket/push infra for anything except the video trigger).
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    async function poll() {
      try {
        const { officeToken: token } = await issueOfficeToken();
        if (!cancelled) {
          setOfficeToken(token);
          setTokenError(null);
        }
      } catch {
        if (!cancelled) setTokenError('Could not refresh the QR code. Retrying…');
      }
    }

    poll();
    const interval = setInterval(poll, TOKEN_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const recordAndUpload = useCallback(async (recordId: string, action: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      setCapture({ phase: 'recording', recordId, action });

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      setTimeout(() => recorder.stop(), RECORDING_DURATION_MS);
      await stopped;

      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      setCapture({ phase: 'uploading' });
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      await uploadOfficeVideo(recordId, action === 'checkout' ? 'checkout' : 'checkin', blob);

      setCapture({ phase: 'done' });
      setTimeout(() => setCapture({ phase: 'idle' }), 3000);
    } catch (err) {
      console.error('Kiosk video capture failed:', err);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCapture({ phase: 'idle' });
    }
  }, []);

  const handleTrigger = useCallback(
    (recordId: string, action: string) => {
      let secondsLeft = 5;
      setCapture({ phase: 'countdown', recordId, action, secondsLeft });
      const tick = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft <= 0) {
          clearInterval(tick);
          recordAndUpload(recordId, action);
        } else {
          setCapture({ phase: 'countdown', recordId, action, secondsLeft });
        }
      }, 1000);
    },
    [recordAndUpload]
  );

  // SSE connection to receive "someone just checked in/out at this kiosk"
  // pushes (Redis pub/sub on the backend, see officeKiosk.controller.js's
  // videoStream). The ticket is single-use, so a dropped connection can't
  // rely on EventSource's own built-in reconnect (it would replay the same,
  // now-consumed, ticket) — reconnection is done manually with a fresh
  // ticket each time.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    async function connect() {
      try {
        const ticket = await issueSseTicket();
        if (cancelled) return;

        const es = new EventSource(videoStreamUrl(ticket));
        eventSourceRef.current = es;

        es.onmessage = (event) => {
          try {
            const { recordId, action } = JSON.parse(event.data) as { recordId: string; action: string };
            handleTrigger(recordId, action);
          } catch (err) {
            console.error('Malformed video-trigger message:', err);
          }
        };

        es.onerror = () => {
          es.close();
          if (!cancelled) {
            reconnectTimerRef.current = setTimeout(connect, STREAM_RECONNECT_DELAY_MS);
          }
        };
      } catch {
        if (!cancelled) {
          reconnectTimerRef.current = setTimeout(connect, STREAM_RECONNECT_DELAY_MS);
        }
      }
    }

    connect();
    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [isAuthenticated, handleTrigger]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
        <form onSubmit={handleLogin} className="w-full max-w-xs space-y-4 rounded-xl bg-card p-8 shadow-lg">
          <div className="text-center">
            <p className="text-lg font-semibold text-ink">Kiosk Sign In</p>
            <p className="text-sm text-ink-muted">Sign in with this device's Scanner account.</p>
          </div>
          {loginError && <p className="text-sm text-danger">{loginError}</p>}
          <input
            type="email"
            required
            placeholder="Kiosk email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <PasswordInput
            id="kiosk-password"
            icon={Lock}
            required
            placeholder="Kiosk password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-70"
          >
            {isLoggingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-sidebar px-4 text-center">
      <div>
        <p className="text-lg font-semibold text-white">{user?.email}</p>
        <p className="text-sm text-white/60">Scan to check in or out</p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-xl">
        {capture.phase === 'idle' &&
          (officeToken ? (
            <QRCodeSVG value={officeToken} size={280} />
          ) : (
            <div className="flex h-[280px] w-[280px] items-center justify-center text-sm text-ink-muted">
              Loading QR…
            </div>
          ))}

        {capture.phase === 'countdown' && (
          <div className="flex h-[280px] w-[280px] flex-col items-center justify-center gap-2">
            <span className="text-6xl font-bold text-primary">{capture.secondsLeft}</span>
            <span className="text-sm text-ink-muted">Get ready…</span>
          </div>
        )}

        {capture.phase === 'recording' && (
          <div className="relative flex h-[280px] w-[280px] items-center justify-center overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-white">
              ● REC
            </span>
          </div>
        )}

        {capture.phase === 'uploading' && (
          <div className="flex h-[280px] w-[280px] items-center justify-center text-sm text-ink-muted">
            Saving…
          </div>
        )}

        {capture.phase === 'done' && (
          <div className="flex h-[280px] w-[280px] items-center justify-center text-sm font-semibold text-success">
            Done ✓
          </div>
        )}
      </div>

      {tokenError && <p className="text-sm text-warning">{tokenError}</p>}
    </div>
  );
}

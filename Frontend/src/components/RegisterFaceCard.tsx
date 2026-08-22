import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ScanFace, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/Button';
import { detectFaceOptions, faceapi, loadFaceApiModels } from '../lib/faceapi';
import { getMyFaceProfileStatus, registerFaceProfile, type FaceProfileStatus } from '../api/ess/faceProfile';

type Angle = 'front' | 'left' | 'right';
const ANGLES: { key: Angle; label: string; instruction: string }[] = [
  { key: 'front', label: 'Front', instruction: 'Look straight at the camera' },
  { key: 'left', label: 'Left', instruction: 'Turn your head slightly left' },
  { key: 'right', label: 'Right', instruction: 'Turn your head slightly right' },
];

const CAPTURE_GUIDELINES = [
  'Find a well-lit spot — face a light source, avoid strong light or windows behind you.',
  'Remove sunglasses, a mask, or anything covering your face. A cap is fine if your face is clear.',
  'Make sure only your face is in frame — no one else standing behind or beside you.',
  'Keep a neutral, relaxed expression with both eyes open, and hold still for a second when capturing.',
  'For each angle, follow the on-screen instruction (straight, slight left, slight right) before tapping it.',
];

const MIN_DETECTION_SCORE = 0.8;
// Same self-consistency ceiling as faceProfile.service.js's server-side
// check — computed here too so a bad capture is caught before the network
// round trip, not just after.
const SELF_CONSISTENCY_MAX_DISTANCE = 0.5;

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

export function RegisterFaceCard() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [status, setStatus] = useState<FaceProfileStatus | null>(null);
  const [captures, setCaptures] = useState<Partial<Record<Angle, number[]>>>({});
  const [activeAngle, setActiveAngle] = useState<Angle | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadFaceApiModels()
      .then(() => setModelsReady(true))
      .catch(() => setError('Could not load face recognition models. Please refresh and try again.'));
    getMyFaceProfileStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // The <video> element only mounts once cameraReady is true (see the JSX
  // below), so attaching the stream has to happen *after* that render, not
  // inside startCamera itself — videoRef.current is still null at that
  // point since the element doesn't exist in the DOM yet.
  useEffect(() => {
    if (cameraReady && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraReady]);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setCameraReady(true);
    } catch {
      setError('Could not access your camera. Please allow camera access and try again.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
    setActiveAngle(null);
  }

  async function captureAngle(angle: Angle) {
    if (!videoRef.current) return;
    setError(null);
    setActiveAngle(angle);
    setIsDetecting(true);
    try {
      // Poll for a clean single-face detection rather than grabbing whatever
      // frame happens to be current — gives the employee a moment to settle
      // into the requested angle.
      let descriptor: Float32Array | null = null;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const result = await faceapi
          .detectSingleFace(videoRef.current, detectFaceOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (result && result.detection.score >= MIN_DETECTION_SCORE) {
          descriptor = result.descriptor;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!descriptor) {
        setError(`Could not clearly detect your face for the ${angle} angle. Please try again.`);
        return;
      }
      setCaptures((prev) => ({ ...prev, [angle]: Array.from(descriptor!) }));
    } finally {
      setIsDetecting(false);
      setActiveAngle(null);
    }
  }

  const allCaptured = ANGLES.every(({ key }) => captures[key]);

  async function handleSubmit() {
    if (!captures.front || !captures.left || !captures.right) return;
    setError(null);
    setSuccess(false);

    const distances = [
      euclideanDistance(captures.front, captures.left),
      euclideanDistance(captures.front, captures.right),
      euclideanDistance(captures.left, captures.right),
    ];
    if (Math.max(...distances) > SELF_CONSISTENCY_MAX_DISTANCE) {
      setError('The three captures do not appear to be the same face. Please retake all three.');
      setCaptures({});
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await registerFaceProfile({ front: captures.front, left: captures.left, right: captures.right });
      setSuccess(true);
      setStatus({ registered: true, registeredAt: result.registeredAt, status: 'active' });
      setCaptures({});
      stopCamera();
    } catch (err) {
      setError(extractError(err, 'Could not register your face. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-md rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ScanFace className="h-4 w-4" strokeWidth={2} />
        Face ID for Kiosk Attendance
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Register your face so a kiosk can recognize you to check in and out — required once
        before your first kiosk attendance.
      </p>

      {status?.registered && (
        <div className="mt-4 rounded-xl border border-success/20 bg-success/5 px-3 py-2.5 text-sm text-success">
          Your face is registered
          {status.registeredAt ? ` (${new Date(status.registeredAt).toLocaleDateString()})` : ''}. You can
          re-register below to replace it.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-success/20 bg-success/5 px-3 py-2.5 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>
            Face registered successfully. Please reach out to your HR or admin team to get set up
            on the face recognition device (kiosk) so you can start checking in and out.
          </span>
        </div>
      )}

      {!cameraReady && (
        <>
          <div className="mt-4 rounded-xl border border-border bg-page px-3 py-3 text-sm text-ink-muted">
            <p className="font-medium text-ink">Before you start, for best results:</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {CAPTURE_GUIDELINES.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={startCamera} disabled={!modelsReady}>
              {modelsReady ? 'Start camera' : 'Loading models…'}
            </Button>
          </div>
        </>
      )}

      {cameraReady && (
        <div className="mt-4 space-y-4">
          {/* CSS-only mirror so this behaves like a normal mirror, not the
              camera's raw reversed feed — face-api.js detection and the
              captured descriptor still read the video element's actual
              unmirrored frame buffer, untouched by the transform. */}
          <video ref={videoRef} muted playsInline className="w-full -scale-x-100 rounded-lg bg-black" />

          <div className="grid grid-cols-3 gap-2">
            {ANGLES.map(({ key, label, instruction }) => (
              <button
                key={key}
                type="button"
                onClick={() => captureAngle(key)}
                disabled={isDetecting}
                title={instruction}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  captures[key]
                    ? 'border-success/30 bg-success/5 text-success'
                    : activeAngle === key
                      ? 'border-primary/40 bg-primary-light text-primary'
                      : 'border-border text-ink-muted hover:border-primary/30'
                }`}
              >
                {captures[key] ? `${label} ✓` : activeAngle === key ? 'Capturing…' : label}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={stopCamera}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!allCaptured} isLoading={isSubmitting}>
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

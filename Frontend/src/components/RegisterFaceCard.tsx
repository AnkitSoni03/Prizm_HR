import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ScanFace, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/Button';
import { getMyFaceProfileStatus, registerFaceProfile, type FaceProfileStatus } from '../api/ess/faceProfile';

const CAPTURE_GUIDELINES = [
  'Find a well-lit spot — face a light source, avoid strong light or windows behind you.',
  'Remove sunglasses, a mask, or anything covering your face. A cap is fine if your face is clear.',
  'Make sure only your face is in frame — no one else standing behind or beside you.',
  'Look straight at the camera with a neutral, relaxed expression and both eyes open.',
];

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

export function RegisterFaceCard() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [status, setStatus] = useState<FaceProfileStatus | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getMyFaceProfileStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedPhoto(null);
    setError(null);
  }

  function capturePhoto() {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Could not capture a photo. Please try again.');
          return;
        }
        setCapturedPhoto(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      'image/jpeg',
      0.9
    );
  }

  async function handleSubmit() {
    if (!capturedPhoto) return;
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);
    try {
      const result = await registerFaceProfile(capturedPhoto);
      setSuccess(true);
      setStatus({ registered: true, registeredAt: result.registeredAt, status: 'active' });
      retake();
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

      {!cameraReady && !previewUrl && (
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
            <Button onClick={startCamera}>Start camera</Button>
          </div>
        </>
      )}

      {cameraReady && (
        <div className="mt-4 space-y-4">
          {/* CSS-only mirror so this behaves like a normal mirror. */}
          <video ref={videoRef} muted playsInline className="w-full -scale-x-100 rounded-lg bg-black" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={stopCamera}>
              Cancel
            </Button>
            <Button onClick={capturePhoto}>Capture</Button>
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="mt-4 space-y-4">
          <img src={previewUrl} alt="Captured face preview" className="w-full -scale-x-100 rounded-lg" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={retake} disabled={isSubmitting}>
              Retake
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import * as faceapi from 'face-api.js';

// Model weight files live under Frontend/public/models/ (not npm-installable —
// fetched separately, see the project's setup notes) and are served as plain
// static files by Vite at the site root. TinyFaceDetector specifically (not
// SSD-Mobilenet/MTCNN) for real-time detection-loop speed at the kiosk.
const MODELS_URL = '/models';

let modelsPromise: Promise<void> | null = null;

export function loadFaceApiModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
    ]).then(() => undefined);
  }
  return modelsPromise;
}

// 416 (the library default) is sized for detecting faces anywhere in a wide
// scene; a kiosk/webcam face is always large and centered, so a much
// smaller input size detects just as reliably here while running noticeably
// faster per frame — this matters a lot in a tight real-time capture loop.
export function detectFaceOptions() {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });
}

export { faceapi };

// Smile ratio: mouth-corner-to-corner width, normalized by jaw width (a
// stable reference that doesn't change when someone smiles) so the metric
// stays meaningful regardless of how close the person is to the camera.
// Widens noticeably on "please smile" and stays flat otherwise — used to
// drive that liveness challenge and as a component of the motion-variance
// check that rejects a frozen/static photo. Chosen over eye-aspect-ratio/
// blink specifically because glasses frequently distort or occlude
// eye-landmark detection, causing false negatives for employees who wear
// them — this reads only the mouth and jaw outline, nowhere near the eyes.
export function smileRatio(landmarks: faceapi.FaceLandmarks68): number {
  const dist = (a: faceapi.Point, b: faceapi.Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const mouth = landmarks.getMouth();
  const jaw = landmarks.getJawOutline();
  const mouthWidth = dist(mouth[0], mouth[6]);
  const jawWidth = dist(jaw[0], jaw[jaw.length - 1]);
  return mouthWidth / jawWidth;
}

// Coarse geometric proxy for head yaw — not true 3D pose estimation, just a
// left/right-jaw-distance-from-nose comparison, but sufficient to detect a
// deliberate "turn your head" gesture for the liveness challenge.
export function estimateYaw(landmarks: faceapi.FaceLandmarks68): number {
  const jaw = landmarks.getJawOutline();
  const nose = landmarks.getNose();
  const noseTip = nose[nose.length - 1];
  const leftJaw = jaw[0];
  const rightJaw = jaw[jaw.length - 1];
  const distToLeft = Math.hypot(noseTip.x - leftJaw.x, noseTip.y - leftJaw.y);
  const distToRight = Math.hypot(noseTip.x - rightJaw.x, noseTip.y - rightJaw.y);
  // Positive = turned toward the right jaw point (i.e. head turned left from
  // the subject's perspective), negative = the opposite. Scaled to a
  // roughly degrees-like range so the threshold constants read naturally.
  return ((distToRight - distToLeft) / (distToRight + distToLeft)) * 100;
}

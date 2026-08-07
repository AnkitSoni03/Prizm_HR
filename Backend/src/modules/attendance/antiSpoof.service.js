'use strict';

const path = require('path');
const sharp = require('sharp');
const ort = require('onnxruntime-node');

// MiniFASNetV2 (128x128), Apache-2.0, github.com/johnraivenolazo/face-antispoof-onnx
// (models/best/98.20/best_model.onnx — the higher-accuracy fp32 variant;
// server-side inference has no edge-device size/speed pressure, so accuracy
// was preferred over the repo's 600KB quantized default). Preprocessing and
// the logit-diff decision rule below are copied exactly from that repo's
// src/inference/{preprocess,inference}.py — verified against the actual
// downloaded model (input name 'input', output name 'output', shape [1,2])
// before wiring this in.
const MODEL_PATH = path.join(__dirname, '../../assets/models/face-anti-spoof.onnx');
const MODEL_IMG_SIZE = 128;
const BBOX_EXPANSION_FACTOR = 1.5;
// threshold=0.5 (the repo's own CLI default) in logit space: p=0.5 ->
// logit(p/(1-p)) = 0, i.e. simply "which class scored higher". Kept at the
// documented default rather than hand-tuned, since there's no labelled
// sample set in this environment to calibrate a stricter margin against —
// flagged in CLAUDE.md as needing real-world threshold tuning once the
// company has Fraud Attempts review data to check it against.
const LOGIT_THRESHOLD = 0;

let sessionPromise = null;
function getSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_PATH);
  }
  return sessionPromise;
}

// Mirrors the reference repo's crop(): expand the detected face bbox to a
// square (max(w,h) * factor) centered on the bbox, clamped to the source
// image bounds. The reference implementation reflect-pads when the
// expanded box runs off the edge of the frame; sharp has no equivalent
// mirror-extend, so this clamps instead — a deliberate, documented
// simplification. In practice a kiosk face is detected (face-api.js) well
// inside the frame before this ever runs, so an edge-clamped (slightly
// off-center) crop rather than a perfectly mirrored one is a rare,
// low-stakes edge case, not a correctness gap in the common case.
function squareCropBox(bbox, imageWidth, imageHeight) {
  const { x, y, width, height } = bbox;
  const maxDim = Math.max(width, height);
  const cropSize = Math.round(maxDim * BBOX_EXPANSION_FACTOR);
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  let left = Math.round(centerX - cropSize / 2);
  let top = Math.round(centerY - cropSize / 2);

  left = Math.max(0, Math.min(left, imageWidth - 1));
  top = Math.max(0, Math.min(top, imageHeight - 1));
  const size = Math.max(1, Math.min(cropSize, imageWidth - left, imageHeight - top));

  return { left, top, width: size, height: size };
}

// buffer: raw image bytes (JPEG/PNG) of the full kiosk frame.
// bbox: { x, y, width, height } in that image's own pixel coordinates.
async function runAntiSpoofCheck(buffer, bbox) {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const crop = squareCropBox(bbox, meta.width, meta.height);

  const { data, info } = await image
    .extract(crop)
    .resize(MODEL_IMG_SIZE, MODEL_IMG_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // info.data is interleaved HWC uint8 RGB (removeAlpha() guarantees 3
  // channels) — convert to CHW float32 /255, matching preprocess.py exactly.
  const channelSize = MODEL_IMG_SIZE * MODEL_IMG_SIZE;
  const chw = new Float32Array(3 * channelSize);
  for (let i = 0; i < channelSize; i += 1) {
    chw[i] = data[i * 3] / 255;
    chw[channelSize + i] = data[i * 3 + 1] / 255;
    chw[2 * channelSize + i] = data[i * 3 + 2] / 255;
  }
  void info;

  const session = await getSession();
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const tensor = new ort.Tensor('float32', chw, [1, 3, MODEL_IMG_SIZE, MODEL_IMG_SIZE]);
  const results = await session.run({ [inputName]: tensor });
  const logits = results[outputName].data;

  const realLogit = Number(logits[0]);
  const spoofLogit = Number(logits[1]);
  const logitDiff = realLogit - spoofLogit;

  return {
    isReal: logitDiff >= LOGIT_THRESHOLD,
    realLogit,
    spoofLogit,
    confidence: Math.abs(logitDiff),
  };
}

module.exports = { runAntiSpoofCheck, squareCropBox };

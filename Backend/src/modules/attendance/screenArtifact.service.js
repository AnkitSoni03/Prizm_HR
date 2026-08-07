'use strict';

const sharp = require('sharp');
const { squareCropBox } = require('./antiSpoof.service');

// Secondary, uncalibrated passive-liveness signal — a plain 2D-frequency
// (moiré) heuristic, not a trained classifier like antiSpoof.service.js.
// There is no labelled sample set in this environment to tune its
// threshold against, so it is deliberately never a hard blocker on its own
// (see faceAttendance.service.js: reason: 'screen_artifact' flags are
// always non-blocking) — it only enriches what an admin sees on the Fraud
// Attempts review page. A phone/tablet/laptop screen recorded by a camera
// typically shows a sharp, concentrated frequency peak (from the beat
// between the screen's pixel grid/refresh and the camera's own sampling)
// that real skin texture — which falls off smoothly across frequencies —
// does not.
const SIZE = 64; // small enough for a naive O(N^2) DFT to be instant
const LOW_FREQ_RADIUS = SIZE * 0.08; // excludes DC/near-DC, always dominant and uninformative
const BAND_MAX_RADIUS = SIZE * 0.45;
const PEAK_TO_MEAN_CAP = 12; // ratio at/above this maps to suspicion score 1.0

// 1D DFT magnitude via direct summation (no FFT library dependency) —
// applied separably (rows, then columns) for the 2D transform. Fine at
// SIZE=64: 64 * 64^2 * 2 passes is a few hundred thousand ops, sub-10ms.
function dft1d(real, imag) {
  const n = real.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k += 1) {
    let sumRe = 0;
    let sumIm = 0;
    for (let t = 0; t < n; t += 1) {
      const angle = (-2 * Math.PI * k * t) / n;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      sumRe += real[t] * cos - imag[t] * sin;
      sumIm += real[t] * sin + imag[t] * cos;
    }
    outRe[k] = sumRe;
    outIm[k] = sumIm;
  }
  return [outRe, outIm];
}

function magnitudeSpectrum2D(grayscale, size) {
  // Rows first.
  let re = new Float64Array(size * size);
  let im = new Float64Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const rowReal = grayscale.subarray(y * size, y * size + size);
    const [rowRe, rowIm] = dft1d(Float64Array.from(rowReal), new Float64Array(size));
    re.set(rowRe, y * size);
    im.set(rowIm, y * size);
  }
  // Then columns on the row-transformed result.
  const outRe = new Float64Array(size * size);
  const outIm = new Float64Array(size * size);
  for (let x = 0; x < size; x += 1) {
    const colRe = new Float64Array(size);
    const colIm = new Float64Array(size);
    for (let y = 0; y < size; y += 1) {
      colRe[y] = re[y * size + x];
      colIm[y] = im[y * size + x];
    }
    const [colOutRe, colOutIm] = dft1d(colRe, colIm);
    for (let y = 0; y < size; y += 1) {
      outRe[y * size + x] = colOutRe[y];
      outIm[y * size + x] = colOutIm[y];
    }
  }

  const magnitude = new Float64Array(size * size);
  for (let i = 0; i < size * size; i += 1) {
    magnitude[i] = Math.hypot(outRe[i], outIm[i]);
  }
  return magnitude;
}

// buffer: raw image bytes of the full kiosk frame; bbox: same face bbox
// passed to the anti-spoof model, so both signals look at the same region.
async function detectScreenArtifacts(buffer, bbox) {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const crop = squareCropBox(bbox, meta.width, meta.height);

  const { data } = await image
    .extract(crop)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const magnitude = magnitudeSpectrum2D(data, SIZE);

  let bandSum = 0;
  let bandCount = 0;
  let bandPeak = 0;
  const half = SIZE / 2;
  for (let y = 0; y < SIZE; y += 1) {
    const fy = y <= half ? y : y - SIZE;
    for (let x = 0; x < SIZE; x += 1) {
      const fx = x <= half ? x : x - SIZE;
      const r = Math.hypot(fx, fy);
      if (r < LOW_FREQ_RADIUS || r > BAND_MAX_RADIUS) continue;
      const energy = magnitude[y * SIZE + x] ** 2;
      bandSum += energy;
      bandCount += 1;
      if (energy > bandPeak) bandPeak = energy;
    }
  }

  const bandMean = bandCount > 0 ? bandSum / bandCount : 0;
  const peakToMeanRatio = bandMean > 0 ? bandPeak / bandMean : 0;
  const suspicionScore = Math.max(0, Math.min(1, peakToMeanRatio / PEAK_TO_MEAN_CAP));

  return { suspicionScore, peakToMeanRatio };
}

module.exports = { detectScreenArtifacts };

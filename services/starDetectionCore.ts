import { Particle } from '../types';

export interface StarDetectionTuning {
  blockSize?: number;
  backgroundStride?: number;
  scanStep?: number;
  thresholdSigma?: number;
  sampleStep?: number;
}

export interface StarDetectionInput {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  random?: () => number;
  tuning?: StarDetectionTuning;
}

const DEFAULT_BLOCK_SIZE = 16;
const DEFAULT_BACKGROUND_STRIDE = 4;
const DEFAULT_SCAN_STEP = 2;
const DEFAULT_THRESHOLD_SIGMA = 3;
const DEFAULT_SAMPLE_STEP = 100;
const RANDOM_DEPTH_EXPONENT = 3;
const MAX_DEPTH = 5;

const clampInt = (value: number | undefined, fallback: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value as number);
  return Math.max(min, Math.min(rounded, max));
};

const clampNumber = (value: number | undefined, fallback: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(value as number, max));
};

const toHex = (value: number): string => value.toString(16).padStart(2, '0');

const resolveTuning = (width: number, height: number, tuning?: StarDetectionTuning) => {
  const maxSpan = Math.max(width, height);
  const blockSize = clampInt(tuning?.blockSize, DEFAULT_BLOCK_SIZE, 4, 128);
  const backgroundStride = clampInt(tuning?.backgroundStride, DEFAULT_BACKGROUND_STRIDE, 1, blockSize);
  const scanStep = clampInt(tuning?.scanStep, DEFAULT_SCAN_STEP, 1, 16);
  const thresholdSigma = clampNumber(tuning?.thresholdSigma, DEFAULT_THRESHOLD_SIGMA, 0.5, 10);
  const sampleStep = clampInt(tuning?.sampleStep, DEFAULT_SAMPLE_STEP, 10, Math.max(10, maxSpan * 2));

  return {
    blockSize,
    backgroundStride,
    scanStep,
    thresholdSigma,
    sampleStep
  };
};

const buildGridLookup = (size: number, blockSize: number): Uint16Array => {
  const lookup = new Uint16Array(size);
  for (let i = 0; i < size; i++) {
    lookup[i] = Math.floor(i / blockSize);
  }
  return lookup;
};

export const detectStarsFromPixels = ({
  width,
  height,
  rgba,
  random = Math.random,
  tuning
}: StarDetectionInput): Particle[] => {
  if (width <= 0 || height <= 0) return [];
  if (rgba.length < width * height * 4) return [];

  const pixelCount = width * height;
  const luma = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    luma[i] = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
  }

  const resolved = resolveTuning(width, height, tuning);
  const { blockSize, backgroundStride, scanStep, thresholdSigma, sampleStep } = resolved;

  const gridW = Math.ceil(width / blockSize);
  const gridH = Math.ceil(height / blockSize);
  const bgGrid = new Float32Array(gridW * gridH);

  const gxByX = buildGridLookup(width, blockSize);
  const gyByY = buildGridLookup(height, blockSize);

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      let minVal = 255;
      const startX = gx * blockSize;
      const startY = gy * blockSize;
      const endX = Math.min(startX + blockSize, width);
      const endY = Math.min(startY + blockSize, height);

      for (let y = startY; y < endY; y += backgroundStride) {
        const row = y * width;
        for (let x = startX; x < endX; x += backgroundStride) {
          const val = luma[row + x];
          if (val < minVal) minVal = val;
        }
      }

      bgGrid[gy * gridW + gx] = minVal;
    }
  }

  let residualSum = 0;
  let residualSqSum = 0;
  let sampleCount = 0;

  for (let i = 0; i < pixelCount; i += sampleStep) {
    const x = i % width;
    const y = Math.floor(i / width);
    const gx = gxByX[x];
    const gy = gyByY[y];
    const bgVal = bgGrid[gy * gridW + gx];
    const residual = Math.max(0, luma[i] - bgVal);
    residualSum += residual;
    residualSqSum += residual * residual;
    sampleCount++;
  }

  if (sampleCount === 0) return [];

  const resMean = residualSum / sampleCount;
  const resStd = Math.sqrt(Math.max(0, residualSqSum / sampleCount - resMean * resMean));
  const threshold = resMean + resStd * thresholdSigma;

  const particles: Particle[] = [];

  for (let y = 2; y < height - 2; y += scanStep) {
    const gy = gyByY[y];
    const row = y * width;

    for (let x = 2; x < width - 2; x += scanStep) {
      const idx = row + x;
      const gx = gxByX[x];
      const bg = bgGrid[gy * gridW + gx];
      const val = luma[idx];
      const residual = val - bg;

      if (residual < threshold) continue;

      if (
        luma[idx] <= luma[idx - 1] ||
        luma[idx] <= luma[idx + 1] ||
        luma[idx] <= luma[idx - width] ||
        luma[idx] <= luma[idx + width]
      ) {
        continue;
      }

      const offset = idx * 4;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

      const z = Math.pow(random(), RANDOM_DEPTH_EXPONENT) * MAX_DEPTH;
      const scaleVal = Math.min(2.0, Math.max(0.2, (residual - threshold) / 50));

      particles.push({
        x: x / width,
        y: y / height,
        z,
        scale: scaleVal,
        color: hex
      });
    }
  }

  return particles;
};

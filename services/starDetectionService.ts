import { Particle } from '../types';
import { detectStarsFromPixels, StarDetectionTuning } from './starDetectionCore';
import { getStarDetectionRuntimeConfig } from './starDetectionConfig';

interface StarDetectionWorkerRequest {
  id: number;
  width: number;
  height: number;
  rgbaBuffer: ArrayBuffer;
  tuning?: StarDetectionTuning;
}

interface StarDetectionWorkerResponse {
  id: number;
  particles?: Particle[];
  error?: string;
}

interface PendingRequest {
  resolve: (particles: Particle[]) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

let starDetectionWorker: Worker | null = null;
let requestSequence = 0;
const pendingRequests = new Map<number, PendingRequest>();

const supportsWorker = () => typeof Worker !== 'undefined';

const cleanupPendingRequest = (id: number) => {
  const pending = pendingRequests.get(id);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  pendingRequests.delete(id);
};

const resetWorker = () => {
  if (starDetectionWorker) {
    starDetectionWorker.terminate();
    starDetectionWorker = null;
  }

  for (const [id, pending] of pendingRequests.entries()) {
    clearTimeout(pending.timeoutId);
    pending.reject(new Error('star-detection-worker-reset'));
    pendingRequests.delete(id);
  }
};

const ensureWorker = (): Worker => {
  if (starDetectionWorker) return starDetectionWorker;

  const worker = new Worker(new URL('./starDetectionWorker.ts', import.meta.url), { type: 'module' });

  worker.onmessage = (event: MessageEvent<StarDetectionWorkerResponse>) => {
    const { id, particles, error } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;

    cleanupPendingRequest(id);

    if (error) {
      pending.reject(new Error(error));
      return;
    }

    pending.resolve(particles || []);
  };

  worker.onerror = () => {
    resetWorker();
  };

  starDetectionWorker = worker;
  return worker;
};

const detectStarsWithWorker = (
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  tuning: StarDetectionTuning,
  timeoutMs: number
): Promise<Particle[]> => {
  const worker = ensureWorker();
  const id = ++requestSequence;
  const transferable = new Uint8ClampedArray(rgba);

  return new Promise<Particle[]>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanupPendingRequest(id);
      reject(new Error('star-detection-worker-timeout'));
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timeoutId });

    const request: StarDetectionWorkerRequest = {
      id,
      width,
      height,
      rgbaBuffer: transferable.buffer,
      tuning
    };

    worker.postMessage(request, [transferable.buffer]);
  });
};

const loadImage = (imageBase64: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.src = imageBase64;
    img.onload = () => resolve(img);
    img.onerror = reject;
  });

const buildAnalysisFrame = (img: HTMLImageElement, analysisWidth: number) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  const scale = Math.min(1, analysisWidth / img.naturalWidth);
  const width = Math.max(1, Math.floor(img.naturalWidth * scale));
  const height = Math.max(1, Math.floor(img.naturalHeight * scale));

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);

  canvas.width = 0;
  canvas.height = 0;

  return {
    width,
    height,
    rgba: imageData.data
  };
};

/**
 * Analyzes an image to find star-like objects using background subtraction.
 * Heavy per-pixel math is delegated to a Web Worker when available.
 */
export const detectStarsFromImage = async (imageBase64: string): Promise<Particle[]> => {
  try {
    const cfg = getStarDetectionRuntimeConfig();
    const startTime = performance.now();
    const img = await loadImage(imageBase64);
    const frame = buildAnalysisFrame(img, cfg.analysisWidth);
    if (!frame) return [];

    const { width, height, rgba } = frame;

    let particles: Particle[];
    let mode: 'worker' | 'main' = 'main';

    if (!cfg.forceMainThread && supportsWorker()) {
      try {
        particles = await detectStarsWithWorker(width, height, rgba, cfg.tuning, cfg.workerTimeoutMs);
        mode = 'worker';
      } catch (workerError) {
        console.warn('star-detection worker fallback:', workerError);
        particles = detectStarsFromPixels({ width, height, rgba, tuning: cfg.tuning });
      }
    } else {
      particles = detectStarsFromPixels({ width, height, rgba, tuning: cfg.tuning });
    }

    const elapsedMs = performance.now() - startTime;
    if (cfg.telemetry) {
      console.info('[StarDetection]', {
        mode,
        elapsedMs: Number(elapsedMs.toFixed(2)),
        particles: particles.length,
        analysisWidth: cfg.analysisWidth,
        tuning: cfg.tuning
      });
    } else {
      console.log(`Detected ${particles.length} stars in ${elapsedMs.toFixed(1)}ms`);
    }

    return particles;
  } catch {
    return [];
  }
};

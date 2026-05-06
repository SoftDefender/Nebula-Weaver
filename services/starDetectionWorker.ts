import { Particle } from '../types';
import { detectStarsFromPixels, StarDetectionTuning } from './starDetectionCore';

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

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<StarDetectionWorkerRequest>) => void) | null;
  postMessage: (response: StarDetectionWorkerResponse) => void;
};

workerScope.onmessage = (event: MessageEvent<StarDetectionWorkerRequest>) => {
  const { id, width, height, rgbaBuffer, tuning } = event.data;

  try {
    const rgba = new Uint8ClampedArray(rgbaBuffer);
    const particles = detectStarsFromPixels({ width, height, rgba, tuning });
    const response: StarDetectionWorkerResponse = { id, particles };
    workerScope.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'star-detection-worker-failed';
    const response: StarDetectionWorkerResponse = { id, error: message };
    workerScope.postMessage(response);
  }
};

export {};

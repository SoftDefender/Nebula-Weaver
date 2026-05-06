import { StarDetectionTuning } from './starDetectionCore';

export interface StarDetectionRuntimeConfig {
  analysisWidth: number;
  workerTimeoutMs: number;
  forceMainThread: boolean;
  telemetry: boolean;
  tuning: Required<StarDetectionTuning>;
}

type RuntimeConfigSource = Partial<Record<string, unknown>>;

const DEFAULT_CONFIG: StarDetectionRuntimeConfig = {
  analysisWidth: 800,
  workerTimeoutMs: 15_000,
  forceMainThread: false,
  telemetry: false,
  tuning: {
    blockSize: 16,
    backgroundStride: 4,
    scanStep: 2,
    thresholdSigma: 3,
    sampleStep: 100
  }
};

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(Math.round(num), max));
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(num, max));
};

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === '1' || value.toLowerCase() === 'true') return true;
    if (value === '0' || value.toLowerCase() === 'false') return false;
  }
  return fallback;
};

const parsePersistedConfig = (): RuntimeConfigSource => {
  if (typeof window === 'undefined' || !window.localStorage) return {};

  try {
    const raw = window.localStorage.getItem('nebula.starDetection');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? (parsed as RuntimeConfigSource) : {};
  } catch {
    return {};
  }
};

const parseQueryConfig = (): RuntimeConfigSource => {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const query: RuntimeConfigSource = {};

  const map: Array<[string, string]> = [
    ['analysisWidth', 'starAnalysisWidth'],
    ['workerTimeoutMs', 'starWorkerTimeoutMs'],
    ['forceMainThread', 'starForceMainThread'],
    ['telemetry', 'starTelemetry'],
    ['blockSize', 'starBlockSize'],
    ['backgroundStride', 'starBackgroundStride'],
    ['scanStep', 'starScanStep'],
    ['thresholdSigma', 'starThresholdSigma'],
    ['sampleStep', 'starSampleStep']
  ];

  for (const [targetKey, queryKey] of map) {
    if (params.has(queryKey)) {
      query[targetKey] = params.get(queryKey) as string;
    }
  }

  return query;
};

export const resolveStarDetectionRuntimeConfig = (
  source: RuntimeConfigSource = {}
): StarDetectionRuntimeConfig => {
  return {
    analysisWidth: clampInt(source.analysisWidth, DEFAULT_CONFIG.analysisWidth, 256, 4096),
    workerTimeoutMs: clampInt(source.workerTimeoutMs, DEFAULT_CONFIG.workerTimeoutMs, 2000, 120_000),
    forceMainThread: parseBoolean(source.forceMainThread, DEFAULT_CONFIG.forceMainThread),
    telemetry: parseBoolean(source.telemetry, DEFAULT_CONFIG.telemetry),
    tuning: {
      blockSize: clampInt(source.blockSize, DEFAULT_CONFIG.tuning.blockSize, 4, 128),
      backgroundStride: clampInt(source.backgroundStride, DEFAULT_CONFIG.tuning.backgroundStride, 1, 64),
      scanStep: clampInt(source.scanStep, DEFAULT_CONFIG.tuning.scanStep, 1, 16),
      thresholdSigma: clampNumber(source.thresholdSigma, DEFAULT_CONFIG.tuning.thresholdSigma, 0.5, 10),
      sampleStep: clampInt(source.sampleStep, DEFAULT_CONFIG.tuning.sampleStep, 10, 5000)
    }
  };
};

export const getStarDetectionRuntimeConfig = (): StarDetectionRuntimeConfig => {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;

  const persisted = parsePersistedConfig();
  const query = parseQueryConfig();
  return resolveStarDetectionRuntimeConfig({ ...persisted, ...query });
};

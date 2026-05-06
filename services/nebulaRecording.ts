export interface RecordableStreamLike {
  active: boolean;
  getTracks: () => ArrayLike<unknown>;
}

type ExportFormat = 'webm' | 'mp4' | 'mkv' | 'mov';
const HIGH_PIXEL_THRESHOLD = 8_000_000;

export const canStartRecording = (
  stream: RecordableStreamLike | null | undefined
): boolean => {
  if (!stream || !stream.active) return false;
  return stream.getTracks().length > 0;
};

const mimeCandidatesByFormat: Record<ExportFormat, string[]> = {
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
  mp4: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=h264,aac', 'video/mp4'],
  mov: ['video/quicktime;codecs=h264,aac', 'video/quicktime'],
  mkv: ['video/x-matroska;codecs=avc1,opus', 'video/x-matroska']
};

const universalFallbacks = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

const browserSupportsMimeType = (mimeType: string): boolean => {
  if (typeof MediaRecorder === 'undefined') return false;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return false;
  return MediaRecorder.isTypeSupported(mimeType);
};

export const resolveRecordingMimeType = (
  requestedFormat: ExportFormat,
  isTypeSupported: (mimeType: string) => boolean = browserSupportsMimeType
): string | null => {
  const orderedCandidates = [
    ...(mimeCandidatesByFormat[requestedFormat] || []),
    ...universalFallbacks
  ];
  for (const mimeType of orderedCandidates) {
    if (isTypeSupported(mimeType)) return mimeType;
  }
  return null;
};

export const sanitizeRecordingSettings = (
  fps: number,
  bitrateMbps: number,
  isMobile: boolean
): { fps: number; bitrateMbps: number } => {
  const numericFps = Number.isFinite(fps) ? fps : 30;
  const numericBitrate = Number.isFinite(bitrateMbps) ? bitrateMbps : 12;
  return {
    fps: isMobile
      ? Math.max(12, Math.min(Math.round(numericFps), 30))
      : Math.max(1, Math.round(numericFps)),
    bitrateMbps: isMobile
      ? Math.max(2, Math.min(numericBitrate, 40))
      : Math.max(2, numericBitrate)
  };
};

export const chooseEffectiveExportFormat = (
  requestedFormat: ExportFormat,
  pixelCount: number
): { format: ExportFormat; downgraded: boolean; reason: string | null } => {
  if (requestedFormat === 'mp4' && pixelCount > HIGH_PIXEL_THRESHOLD) {
    return {
      format: 'webm',
      downgraded: true,
      reason: `mp4-unsupported-at-high-pixel-count(${pixelCount})`
    };
  }
  return { format: requestedFormat, downgraded: false, reason: null };
};

export const createRecorderOptions = (
  resolvedMimeType: string | null,
  bitrateMbps: number
): MediaRecorderOptions => {
  const safeBitsPerSecond = Math.max(1_000_000, Math.round(bitrateMbps * 1_000_000));
  if (!resolvedMimeType) {
    return { bitsPerSecond: safeBitsPerSecond };
  }
  return { mimeType: resolvedMimeType, bitsPerSecond: safeBitsPerSecond };
};

export const hasUsableRecordingChunks = (
  chunks: Blob[],
  minTotalBytes = 128
): boolean => {
  if (!Array.isArray(chunks) || chunks.length === 0) return false;
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  return totalBytes >= minTotalBytes;
};

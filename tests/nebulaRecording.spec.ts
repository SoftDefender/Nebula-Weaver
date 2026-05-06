import { describe, it, expect } from 'vitest';
import {
  canStartRecording,
  resolveRecordingMimeType,
  sanitizeRecordingSettings,
  createRecorderOptions,
  hasUsableRecordingChunks,
  chooseEffectiveExportFormat
} from '../services/nebulaRecording';

describe('canStartRecording', () => {
  it('returns true only for active streams with tracks', () => {
    expect(
      canStartRecording({
        active: true,
        getTracks: () => [{ id: 1 }]
      })
    ).toBe(true);
  });

  it('returns false for inactive streams or empty tracks', () => {
    expect(
      canStartRecording({
        active: false,
        getTracks: () => [{ id: 1 }]
      })
    ).toBe(false);

    expect(
      canStartRecording({
        active: true,
        getTracks: () => []
      })
    ).toBe(false);
    expect(canStartRecording(undefined)).toBe(false);
  });
});

describe('resolveRecordingMimeType', () => {
  it('prefers requested format candidates when supported', () => {
    const supportMap = new Set(['video/mp4;codecs=h264,aac', 'video/webm']);
    const supported = (mimeType: string) => supportMap.has(mimeType);
    expect(resolveRecordingMimeType('mp4', supported)).toBe('video/mp4;codecs=h264,aac');
  });

  it('falls back to webm candidates when requested format is unsupported', () => {
    const supportMap = new Set(['video/webm;codecs=vp8']);
    const supported = (mimeType: string) => supportMap.has(mimeType);
    expect(resolveRecordingMimeType('mov', supported)).toBe('video/webm;codecs=vp8');
  });

  it('returns null when no candidate is supported', () => {
    expect(resolveRecordingMimeType('mkv', () => false)).toBeNull();
  });
});

describe('sanitizeRecordingSettings', () => {
  it('preserves desktop bitrate/fps without forced loss', () => {
    expect(sanitizeRecordingSettings(60, 80, false)).toEqual({ fps: 60, bitrateMbps: 80 });
  });

  it('clamps mobile values and enforces lower bounds', () => {
    expect(sanitizeRecordingSettings(1, 999, true)).toEqual({ fps: 12, bitrateMbps: 40 });
    expect(sanitizeRecordingSettings(1, 0, true)).toEqual({ fps: 12, bitrateMbps: 2 });
  });
});

describe('createRecorderOptions', () => {
  it('includes mime type when resolved', () => {
    expect(createRecorderOptions('video/webm', 8)).toEqual({
      mimeType: 'video/webm',
      bitsPerSecond: 8000000
    });
  });

  it('returns bitrate-only options when mime type is unresolved', () => {
    expect(createRecorderOptions(null, 3)).toEqual({ bitsPerSecond: 3000000 });
  });
});

describe('hasUsableRecordingChunks', () => {
  it('rejects empty or too-small payloads', () => {
    expect(hasUsableRecordingChunks([])).toBe(false);
    expect(hasUsableRecordingChunks([new Blob(['x'])])).toBe(false);
  });

  it('accepts chunks when total size crosses threshold', () => {
    const payload = new Uint8Array(10000);
    expect(hasUsableRecordingChunks([new Blob([payload])])).toBe(true);
  });
});

describe('chooseEffectiveExportFormat', () => {
  it('keeps requested format for normal pixel counts', () => {
    expect(chooseEffectiveExportFormat('mp4', 2_000_000)).toEqual({
      format: 'mp4',
      downgraded: false,
      reason: null
    });
  });

  it('downgrades mp4 to webm for large pixel counts', () => {
    const result = chooseEffectiveExportFormat('mp4', 10_000_000);
    expect(result.format).toBe('webm');
    expect(result.downgraded).toBe(true);
    expect(result.reason).toContain('mp4-unsupported-at-high-pixel-count');
  });
});

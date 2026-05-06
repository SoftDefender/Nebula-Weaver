import { describe, expect, test } from 'vitest';

import {
  normalizeOutputMimeType,
  safeCanvasToBlob
} from '../services/compressorService';

describe('compressorService boundary helpers', () => {
  test('normalizeOutputMimeType falls back to jpeg for unsupported original mime', () => {
    expect(normalizeOutputMimeType('image/heic', 'original')).toBe('image/jpeg');
    expect(normalizeOutputMimeType('image/png', 'original')).toBe('image/png');
    expect(normalizeOutputMimeType('image/png', 'image/webp')).toBe('image/webp');
  });

  test('safeCanvasToBlob rejects when canvas returns null blob', async () => {
    const fakeCanvas = {
      toBlob: (cb: BlobCallback) => cb(null)
    };

    await expect(safeCanvasToBlob(fakeCanvas, 'image/jpeg', 0.8)).rejects.toThrow(
      'Canvas toBlob returned null'
    );
  });
});


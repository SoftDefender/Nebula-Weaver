import { describe, it, expect } from 'vitest';
import {
  buildNebulaExportFilename,
  getVideoExtensionFromMime
} from '../services/videoExportNaming';

describe('videoExportNaming', () => {
  it('maps common mime types to expected extensions', () => {
    expect(getVideoExtensionFromMime('video/mp4')).toBe('mp4');
    expect(getVideoExtensionFromMime('video/webm;codecs=vp9')).toBe('webm');
    expect(getVideoExtensionFromMime('video/x-matroska')).toBe('mkv');
    expect(getVideoExtensionFromMime('video/quicktime')).toBe('mov');
    expect(getVideoExtensionFromMime('video/unknown')).toBe('webm');
  });

  it('sanitizes filename and applies fallback base name', () => {
    expect(buildNebulaExportFilename('M42/Orion', 'video/mp4')).toBe('M42_Orion_nebula.mp4');
    expect(buildNebulaExportFilename('', 'video/webm')).toBe('nebula_nebula.webm');
  });
});


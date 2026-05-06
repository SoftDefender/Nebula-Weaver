import { describe, it, expect } from 'vitest';
import { resolveCompressedFilename } from '../services/compressorNaming';

describe('resolveCompressedFilename', () => {
  it('prefers result blob mime extension for original mode', () => {
    const name = resolveCompressedFilename(
      'astro.heic',
      { outputFormat: 'original' },
      'image/jpeg'
    );
    expect(name).toBe('astro_optimized.jpeg');
  });

  it('falls back to source extension when result mime missing', () => {
    const name = resolveCompressedFilename('planet.PNG', { outputFormat: 'original' }, '');
    expect(name).toBe('planet_optimized.png');
  });

  it('uses forced output format extension', () => {
    const name = resolveCompressedFilename(
      'deep-sky.jpg',
      { outputFormat: 'image/webp' },
      'image/jpeg'
    );
    expect(name).toBe('deep-sky_optimized.webp');
  });
});


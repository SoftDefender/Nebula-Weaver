import { describe, expect, test } from 'vitest';

import { detectStarsFromPixels } from '../services/starDetectionCore';

const createFrame = (width: number, height: number, base = 0) => {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    rgba[offset] = base;
    rgba[offset + 1] = base;
    rgba[offset + 2] = base;
    rgba[offset + 3] = 255;
  }
  return rgba;
};

const setPixel = (
  rgba: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number
) => {
  const offset = (y * width + x) * 4;
  rgba[offset] = r;
  rgba[offset + 1] = g;
  rgba[offset + 2] = b;
  rgba[offset + 3] = 255;
};

describe('starDetectionCore', () => {
  test('returns empty when frame size is invalid', () => {
    const rgba = new Uint8ClampedArray(0);
    expect(detectStarsFromPixels({ width: 0, height: 0, rgba })).toEqual([]);
  });

  test('detects a local bright maximum and maps normalized coordinates', () => {
    const width = 20;
    const height = 20;
    const rgba = createFrame(width, height, 2);

    setPixel(rgba, width, 10, 10, 255, 255, 255);
    setPixel(rgba, width, 9, 10, 10, 10, 10);
    setPixel(rgba, width, 11, 10, 10, 10, 10);
    setPixel(rgba, width, 10, 9, 10, 10, 10);
    setPixel(rgba, width, 10, 11, 10, 10, 10);

    const particles = detectStarsFromPixels({
      width,
      height,
      rgba,
      random: () => 0.5
    });

    expect(particles.length).toBeGreaterThan(0);
    const brightest = particles[0];
    expect(brightest.x).toBeCloseTo(0.5, 1);
    expect(brightest.y).toBeCloseTo(0.5, 1);
    expect(brightest.color).toBe('#ffffff');
    expect(brightest.z).toBeCloseTo(0.625, 3);
  });

  test('converts source RGB values to particle hex color', () => {
    const width = 20;
    const height = 20;
    const rgba = createFrame(width, height, 0);

    setPixel(rgba, width, 8, 8, 10, 20, 30);
    setPixel(rgba, width, 7, 8, 0, 0, 0);
    setPixel(rgba, width, 9, 8, 0, 0, 0);
    setPixel(rgba, width, 8, 7, 0, 0, 0);
    setPixel(rgba, width, 8, 9, 0, 0, 0);

    const particles = detectStarsFromPixels({ width, height, rgba, random: () => 0.25 });
    expect(particles.some((p) => p.color === '#0a141e')).toBe(true);
  });
});

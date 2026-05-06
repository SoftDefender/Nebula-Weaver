import { bench, describe } from 'vitest';

import { detectStarsFromPixels } from '../services/starDetectionCore';

const WIDTH = 1600;
const HEIGHT = 900;

const buildSyntheticFrame = () => {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;
      const noise = ((x * 13 + y * 17) % 11);
      const base = 8 + noise;
      rgba[idx] = base;
      rgba[idx + 1] = base;
      rgba[idx + 2] = base;
      rgba[idx + 3] = 255;
    }
  }

  for (let i = 0; i < 800; i++) {
    const x = (i * 37) % (WIDTH - 4) + 2;
    const y = (i * 53) % (HEIGHT - 4) + 2;
    const idx = (y * WIDTH + x) * 4;
    rgba[idx] = 255;
    rgba[idx + 1] = 255;
    rgba[idx + 2] = 255;
  }

  return rgba;
};

const frame = buildSyntheticFrame();

describe('starDetectionCore benchmark', () => {
  bench('default tuning', () => {
    detectStarsFromPixels({ width: WIDTH, height: HEIGHT, rgba: frame });
  });

  bench('aggressive performance tuning', () => {
    detectStarsFromPixels({
      width: WIDTH,
      height: HEIGHT,
      rgba: frame,
      tuning: {
        blockSize: 24,
        backgroundStride: 6,
        scanStep: 3,
        thresholdSigma: 3.2,
        sampleStep: 160
      }
    });
  });
});

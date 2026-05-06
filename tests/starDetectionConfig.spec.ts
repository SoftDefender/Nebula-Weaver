import { describe, expect, test } from 'vitest';

import { resolveStarDetectionRuntimeConfig } from '../services/starDetectionConfig';

describe('starDetectionConfig', () => {
  test('uses defaults when source is empty', () => {
    const cfg = resolveStarDetectionRuntimeConfig({});
    expect(cfg.analysisWidth).toBe(800);
    expect(cfg.workerTimeoutMs).toBe(15000);
    expect(cfg.forceMainThread).toBe(false);
    expect(cfg.telemetry).toBe(false);
    expect(cfg.tuning.blockSize).toBe(16);
  });

  test('clamps numeric values and parses booleans', () => {
    const cfg = resolveStarDetectionRuntimeConfig({
      analysisWidth: '99999',
      workerTimeoutMs: '100',
      forceMainThread: 'true',
      telemetry: '1',
      blockSize: 2,
      backgroundStride: 200,
      scanStep: 99,
      thresholdSigma: 0.1,
      sampleStep: 3
    });

    expect(cfg.analysisWidth).toBe(4096);
    expect(cfg.workerTimeoutMs).toBe(2000);
    expect(cfg.forceMainThread).toBe(true);
    expect(cfg.telemetry).toBe(true);
    expect(cfg.tuning.blockSize).toBe(4);
    expect(cfg.tuning.backgroundStride).toBe(64);
    expect(cfg.tuning.scanStep).toBe(16);
    expect(cfg.tuning.thresholdSigma).toBe(0.5);
    expect(cfg.tuning.sampleStep).toBe(10);
  });
});

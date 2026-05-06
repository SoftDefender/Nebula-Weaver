import { describe, it, expect } from 'vitest';
import { getViewerEnvironmentProfile } from '../services/viewerEnvironment';

describe('getViewerEnvironmentProfile', () => {
  it('returns baseline profile in non-pro mode', () => {
    const profile = getViewerEnvironmentProfile('neutral', false);
    expect(profile.background).toBe(0xf4f6f8);
    expect(profile.ambientIntensity).toBe(0.5);
    expect(profile.directionalIntensity).toBe(1.0);
    expect(profile.fillLightIntensity).toBe(0.0);
  });

  it('boosts fill and directional lights in pro mode', () => {
    const standard = getViewerEnvironmentProfile('sunset', false);
    const pro = getViewerEnvironmentProfile('sunset', true);

    expect(pro.fillLightIntensity).toBeGreaterThan(standard.fillLightIntensity);
    expect(pro.directionalIntensity).toBeGreaterThan(standard.directionalIntensity);
    expect(pro.ambientIntensity).toBeLessThan(standard.ambientIntensity);
  });
});


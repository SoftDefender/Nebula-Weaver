import { ViewerConfig } from '../types';

interface ViewerEnvironmentProfile {
  background: number;
  ambientIntensity: number;
  directionalIntensity: number;
  fillLightColor: number;
  fillLightIntensity: number;
}

const PROFILES: Record<ViewerConfig['environment'], ViewerEnvironmentProfile> = {
  neutral: {
    background: 0xf4f6f8,
    ambientIntensity: 0.5,
    directionalIntensity: 1.0,
    fillLightColor: 0x3b82f6,
    fillLightIntensity: 0.0
  },
  studio: {
    background: 0xe5e7eb,
    ambientIntensity: 0.75,
    directionalIntensity: 1.1,
    fillLightColor: 0xffffff,
    fillLightIntensity: 0.35
  },
  night: {
    background: 0x050505,
    ambientIntensity: 0.18,
    directionalIntensity: 0.7,
    fillLightColor: 0x4f46e5,
    fillLightIntensity: 1.1
  },
  sunset: {
    background: 0x2a120c,
    ambientIntensity: 0.3,
    directionalIntensity: 0.9,
    fillLightColor: 0xfb923c,
    fillLightIntensity: 0.85
  },
  warehouse: {
    background: 0x1f2937,
    ambientIntensity: 0.45,
    directionalIntensity: 1.2,
    fillLightColor: 0x94a3b8,
    fillLightIntensity: 0.25
  }
};

export const getViewerEnvironmentProfile = (
  environment: ViewerConfig['environment'],
  isProMode: boolean
): ViewerEnvironmentProfile => {
  const base = PROFILES[environment] ?? PROFILES.neutral;
  if (!isProMode) return base;

  return {
    ...base,
    ambientIntensity: base.ambientIntensity * 0.85,
    directionalIntensity: base.directionalIntensity * 1.05,
    fillLightIntensity: base.fillLightIntensity + 0.25
  };
};


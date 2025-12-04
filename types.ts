
export type Resolution = '1080p' | '4k' | 'original';

export interface VideoConfig {
  resolution: Resolution;
  bitrate: number; // Mbps
}

export interface ParticleConfig {
  density: number; // Number of particles
  baseSize: number;
  brightness: number; // Global opacity 0-1
  color: string; // Hex color
}

export interface AnimationConfig {
  initialScale: number;
  finalScale: number;
  rotationDirection: 'cw' | 'ccw'; // clockwise, counter-clockwise
  rotationSpeed: number;
  duration: number; // in seconds
}

export interface NebulaData {
  name: string;
  imageBase64: string | null;
  analysis?: NebulaAnalysis;
}

export interface NebulaAnalysis {
  description: string;
  dominantColors: string[];
  starHotspots: { x: number; y: number }[]; 
}

export interface Particle {
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  z: number; // Depth factor (parallax)
  scale: number; // Size variation factor
}

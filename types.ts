
export type Resolution = '1080p' | '4k' | 'original';

export interface VideoConfig {
  resolution: Resolution;
  bitrate: number; // Mbps
}

export interface ParticleConfig {
  density: number; // Number of particles
  baseSize: number;
  brightness: number; // Global opacity/intensity 0-3
  color: string; // Hex color
  feathering: number; // Glow/Feather expansion factor (0-3)
}

export interface AnimationConfig {
  initialScale: number;
  finalScale: number;
  rotationDirection: 'cw' | 'ccw'; // clockwise, counter-clockwise
  rotationSpeed: number;
  duration: number; // in seconds
  zoomOrigin: { x: number; y: number }; // Normalized 0-1, default 0.5, 0.5
}

export interface NebulaData {
  name: string;
  identifiedName?: string; // Name guessed by AI
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

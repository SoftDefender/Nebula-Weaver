
export type Resolution = '1080p' | '4k' | 'original';
export type ExportFormat = 'webm' | 'mp4' | 'mkv' | 'mov';

export interface VideoConfig {
  resolution: Resolution;
  bitrate: number; // Mbps
  format: ExportFormat;
}

export interface ParticleConfig {
  density: number; // Number of particles
  baseSize: number;
  brightness: number; // Global opacity/intensity 0-3
  color: string; // Hex color
  feathering: number; // Glow/Feather expansion factor (-3 to 3)
}

export interface AnimationConfig {
  initialScale: number;
  finalScale: number;
  rotationDirection: 'cw' | 'ccw'; // clockwise, counter-clockwise
  rotationSpeed: number;
  duration: number; // in seconds
  zoomOrigin: { x: number; y: number }; // Normalized 0-1, default 0.5, 0.5
}

export interface NebulaAnalysis {
  description: string;
  dominantColors: string[];
  starHotspots: { x: number; y: number }[]; 
}

export interface BatchItem {
  id: string;
  name: string; // User edited or final name
  identifiedName?: string; // AI Guess
  imageBase64: string;
  status: 'idle' | 'analyzing' | 'success' | 'error';
  analysis?: NebulaAnalysis;
  detectedParticles: Particle[] | null;
  detectionMode: 'real' | 'ai-map' | 'procedural';
}

export interface Particle {
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  z: number; // Depth factor (parallax)
  scale: number; // Size variation factor
  color?: string; // Specific star color if detected
}

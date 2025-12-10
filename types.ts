
export type Resolution = '1080p' | '4k' | 'original';
export type ExportFormat = 'webm' | 'mp4' | 'mkv' | 'mov';

export interface VideoConfig {
  resolution: Resolution;
  bitrate: number; // Mbps
  format: ExportFormat;
  fps: number; // Frames per second
}

export interface ParticleConfig {
  density: number; // Number of particles
  baseSize: number;
  brightness: number; // Global opacity/intensity 0-3
  color: string; // Hex color
  feathering: number; // Glow/Feather expansion factor (-3 to 3)
  spikeGain: number; // Star spike length/intensity
  spikeThreshold: number; // Minimum scale/brightness to show spikes
  spikeAngle: number; // Rotation in degrees
  alpha?: number;
}

export interface AnimationConfig {
  initialScale: number;
  finalScale: number;
  rotationDirection: 'cw' | 'ccw'; // clockwise, counter-clockwise
  rotationSpeed: number;
  duration: number; // in seconds
  // zoomOrigin removed from global config, now handled per BatchItem
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
  zoomOrigin?: { x: number; y: number }; // Per-image zoom center
}

export interface Particle {
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  z: number; // Depth factor (parallax)
  scale: number; // Size variation factor
  alpha?: number; // Individual brightness/opacity variance
  color?: string; // Specific star color if detected
}

// --- Photo Framer Types ---

export type FrameAspectRatio = 'original' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '1:2' | '2:1' | 'custom';

export interface FrameConfig {
  aspectRatio: FrameAspectRatio;
  customWidth?: number;
  customHeight?: number;
  scale: number; // 0.1 to 1.0 (Controls margin)
  shadowColor: 'black' | 'white';
  shadowIntensity: number; // 0 to 100
  blurIntensity: number; // 0 to 100
  borderRadius: number; // 0 to 100 (relative to size)
}

export interface FramedImage {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}
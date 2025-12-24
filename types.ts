
export type Resolution = '1080p' | '4k' | 'original';
export type ExportFormat = 'webm' | 'mp4' | 'mkv' | 'mov';
export type ImageFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
export type SizeUnit = 'KB' | 'MB' | 'GB';

// --- Nebula Weaver Types ---
export interface VideoConfig {
  resolution: Resolution;
  bitrate: number;
  format: ExportFormat;
  fps: number;
}

export interface ParticleConfig {
  density: number;
  baseSize: number;
  brightness: number;
  color: string;
  feathering: number;
  spikeGain: number;
  spikeThreshold: number;
  spikeAngle: number;
  alpha?: number;
}

export interface AnimationConfig {
  initialScale: number;
  finalScale: number;
  rotationDirection: 'cw' | 'ccw';
  rotationSpeed: number;
  duration: number;
}

export interface NebulaAnalysis {
  description: string;
  dominantColors: string[];
  starHotspots: { x: number; y: number }[]; 
}

export interface BatchItem {
  id: string;
  name: string;
  identifiedName?: string;
  imageBase64: string;
  status: 'idle' | 'analyzing' | 'success' | 'error';
  analysis?: NebulaAnalysis;
  detectedParticles: Particle[] | null;
  detectionMode: 'real' | 'ai-map' | 'procedural';
  zoomOrigin?: { x: number; y: number };
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  scale: number;
  alpha?: number;
  color?: string;
}

// --- Photo Framer Types ---
export type FrameAspectRatio = 'original' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '1:2' | '2:1' | 'custom';

export interface FrameConfig {
  aspectRatio: FrameAspectRatio;
  customWidth?: number;
  customHeight?: number;
  scale: number;
  shadowColor: 'black' | 'white';
  shadowIntensity: number;
  blurIntensity: number;
  borderRadius: number;
}

export interface ImageEditConfig {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  zoom: number;
  panX: number;
  panY: number;
}

export interface FramedImage {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  editConfig: ImageEditConfig;
  status?: 'pending' | 'processing' | 'done' | 'error';
}

export interface RenderRequest {
  id: string;
  imageBitmap: ImageBitmap | HTMLImageElement;
  frameConfig: FrameConfig;
  editConfig: ImageEditConfig;
  quality: 'preview' | 'full'; 
}

export interface RenderResponse {
  id: string;
  blob: Blob | null;
  error?: string;
}

// --- Model Studio (3D) Types ---
export type ModelFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'fbx' | 'primitive';

export interface ModelAnalysis {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  dimensions: { x: number; y: number; z: number };
}

export interface ModelNode {
  id: string;
  name: string;
  type: 'group' | 'mesh';
  visible: boolean;
  children?: ModelNode[];
}

export interface ModelLayerProperties {
  color: string;
  opacity: number;
  scale: { x: number, y: number, z: number };
  position: { x: number, y: number, z: number };
  visible: boolean;
  parentId?: string; // For binding/parenting
}

export interface ModelStudioItem {
  id: string;
  name: string;
  file?: File;
  url: string;
  format: ModelFormat;
  analysis?: ModelAnalysis;
  sceneTree?: ModelNode[];
  properties: ModelLayerProperties;
  status: 'pending' | 'loading' | 'success' | 'error';
}

export interface ViewerConfig {
  showGrid: boolean;
  showAxes: boolean;
  exposure: number;
  environment: 'neutral' | 'studio' | 'night' | 'sunset' | 'warehouse';
  autoRotate: boolean;
  wireframe: boolean;
  isProMode: boolean;
  showNormals?: boolean;
}

// --- Photo Compressor Types ---
export interface CompressionSettings {
  targetSize: number;
  targetUnit: SizeUnit;
  outputFormat: 'original' | ImageFormat;
  preserveMetadata: boolean;
  maintainAspectRatio: boolean;
}

export interface CompressorItem {
  id: string;
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize?: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  resultBlob?: Blob;
  error?: string;
}

// --- Workflow Types ---
export type ActionType = 
  | 'RECENTER' 
  | 'NORMALIZE_SCALE' 
  | 'TOGGLE_WIREFRAME' 
  | 'EXPORT_GLB' 
  | 'RESET_CAMERA'
  | 'DELETE_LAYER'
  | 'DUPLICATE_LAYER'
  | 'BIND_PARENT'
  | 'UNBIND_PARENT';

export interface WorkflowAction {
  id: string;
  type: ActionType;
  label: string;
  description: string;
}

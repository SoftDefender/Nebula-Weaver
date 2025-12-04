
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AnimationConfig, ParticleConfig, NebulaAnalysis, Particle, VideoConfig } from '../types';
import { PlayIcon, PauseIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

interface NebulaCanvasProps {
  imageBase64: string | null;
  particleConfig: ParticleConfig;
  animationConfig: AnimationConfig;
  videoConfig: VideoConfig;
  analysis: NebulaAnalysis | undefined;
  detectedParticles: Particle[] | null; 
  isRecording: boolean;
  onRecordingComplete: (url: string) => void;
  triggerPreview: number; 
  onSetZoomOrigin?: (x: number, y: number) => void;
}

const NebulaCanvas: React.FC<NebulaCanvasProps> = ({
  imageBase64,
  particleConfig,
  animationConfig,
  videoConfig,
  analysis,
  detectedParticles,
  isRecording,
  onRecordingComplete,
  triggerPreview,
  onSetZoomOrigin
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const imageRef = useRef<HTMLImageElement | null>(null);
  
  const starSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const spriteCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackProgress, setPlaybackProgress] = useState(0); 
  
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [activeParticles, setActiveParticles] = useState<Particle[]>([]);

  // Improved Star Sprite: Core Highlight + Blur
  const createStarSprite = (color: string) => {
    // Check Cache
    if (spriteCacheRef.current.has(color)) {
      return spriteCacheRef.current.get(color)!;
    }

    const size = 64; 
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;

    // Apply mild Gaussian blur
    ctx.filter = 'blur(1px)';

    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, radius);
    
    // Stop 0: Pure HOT White Core
    grad.addColorStop(0.0, '#FFFFFF'); 
    grad.addColorStop(0.1, '#FFFFFF'); 
    
    // Stop 0.25: User Color (High Intensity)
    grad.addColorStop(0.25, color);
    
    // Stop 0.6: Fade
    grad.addColorStop(0.6, color.length === 7 ? `${color}40` : color);
    
    // Stop 1.0: Transparent
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    
    spriteCacheRef.current.set(color, canvas);
    return canvas;
  };

  useEffect(() => {
    // Clear cache when base particle config changes if needed, 
    // but usually color is the main key.
    // If user changes the global color picker, we update the "default" sprite ref
    starSpriteRef.current = createStarSprite(particleConfig.color);
  }, [particleConfig.color]);

  useEffect(() => {
    if (imageBase64) {
      const img = new Image();
      img.src = imageBase64;
      img.onload = () => {
        imageRef.current = img;
        updateCanvasSize(img, videoConfig.resolution);
      };
    } else {
      imageRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageBase64]);

  useEffect(() => {
    setPlaybackProgress(0);
    setIsPlaying(true);
    lastTimeRef.current = 0;
  }, [triggerPreview, isRecording]);

  // CRITICAL: only resize if resolution changes. 
  // Bitrate and Format changes are ignored here to prevent preview reload.
  useEffect(() => {
    if (imageRef.current) {
      updateCanvasSize(imageRef.current, videoConfig.resolution);
    }
  }, [videoConfig.resolution]);

  const updateCanvasSize = (img: HTMLImageElement, resolution: string) => {
    const aspect = img.naturalWidth / img.naturalHeight;
    let w = img.naturalWidth;
    let h = img.naturalHeight;

    if (resolution === '1080p') {
      if (w > h) { w = 1920; h = 1920 / aspect; } 
      else { h = 1080; w = 1080 * aspect; }
    } else if (resolution === '4k') {
      if (w > h) { w = 3840; h = 3840 / aspect; }
      else { h = 2160; w = 2160 * aspect; }
    }

    w = Math.floor(w / 2) * 2;
    h = Math.floor(h / 2) * 2;

    setCanvasSize({ width: w, height: h });
  };

  useEffect(() => {
    const MAX_PARTICLES = 3000;

    if (detectedParticles && detectedParticles.length > 0) {
      let particlesToUse = detectedParticles;
      if (detectedParticles.length > MAX_PARTICLES) {
        particlesToUse = [...detectedParticles]
          .sort((a, b) => b.scale - a.scale)
          .slice(0, MAX_PARTICLES);
      }
      setActiveParticles(particlesToUse);
    } else {
      const generateParticles = (count: number) => {
        const particles: Particle[] = [];
        const safeCount = Math.min(count, MAX_PARTICLES);
        for (let i = 0; i < safeCount; i++) {
          const z = Math.pow(Math.random(), 3) * 5.0; 
          particles.push({
            x: Math.random(),
            y: Math.random(),
            z: z, 
            scale: 0.5 + Math.random() * 1.0, 
          });
        }
        return particles;
      };
      setActiveParticles(generateParticles(particleConfig.density));
    }
  }, [detectedParticles, particleConfig.density]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSetZoomOrigin || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onSetZoomOrigin(x, y);
  };

  const drawFrame = useCallback((progress: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !imageRef.current) return;

    const cW = canvas.width;
    const cH = canvas.height;
    const zOriginX = animationConfig.zoomOrigin.x * cW;
    const zOriginY = animationConfig.zoomOrigin.y * cH;

    const elapsedSeconds = progress * animationConfig.duration;

    ctx.clearRect(0, 0, cW, cH);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cW, cH);

    const dir = animationConfig.rotationDirection === 'cw' ? 1 : -1;
    const rotation = (elapsedSeconds * (animationConfig.rotationSpeed * 0.2) * dir * Math.PI) / 180;
    
    const currentScale = animationConfig.initialScale + (animationConfig.finalScale - animationConfig.initialScale) * progress;

    ctx.save();
    
    ctx.translate(cW / 2, cH / 2);
    ctx.rotate(rotation);
    ctx.translate(-cW / 2, -cH / 2);
    
    // 1. Draw Background
    ctx.save(); 
    ctx.translate(zOriginX, zOriginY);
    ctx.scale(currentScale, currentScale);
    ctx.translate(-zOriginX, -zOriginY);
    ctx.drawImage(imageRef.current, 0, 0, cW, cH);
    ctx.restore(); 

    // 2. Draw Particles
    const { baseSize, brightness, feathering } = particleConfig;
    const canvasDiagonal = Math.sqrt(cW * cW + cH * cH);
    const refDiagonal = Math.sqrt(800 * 600);
    const resolutionScale = canvasDiagonal / refDiagonal;

    ctx.globalCompositeOperation = 'screen'; 
    
    // Brightness Control: If > 200%, simulate overexposure bloom
    const isOverexposed = brightness > 2.0;
    
    // If not overexposed, just use standard filter. 
    // If overexposed, we use filter up to 200%, and handle the rest via sprite scaling
    const filterBrightness = Math.min(brightness, 2.0) * 100;
    ctx.filter = `brightness(${filterBrightness}%)`;

    ctx.globalAlpha = Math.min(1, brightness); 

    const zoomDelta = currentScale - animationConfig.initialScale;
    
    // Internal mapping size
    const internalSizeMultiplier = 0.25;

    // Calculate Feathering Scale Logic
    let featheringMultiplier = 1.0;
    if (feathering >= 0) {
      // Positive: Expansion (1.0 to 4.0)
      featheringMultiplier = 1.0 + feathering;
    } else {
      // Negative: Contraction/Sharpening (-3 to 0 -> 0.25 to 1.0)
      featheringMultiplier = 1.0 / (1.0 + Math.abs(feathering));
    }

    if (baseSize > 0 && brightness > 0) {
      for (let i = 0; i < activeParticles.length; i++) {
        const p = activeParticles[i];

        // Determine sprite to use
        let sprite = starSpriteRef.current;
        if (p.color) {
           sprite = createStarSprite(p.color);
        }
        if (!sprite) continue;

        const pX = p.x * cW;
        const pY = p.y * cH;
        const vecX = pX - zOriginX;
        const vecY = pY - zOriginY;

        const parallaxScale = currentScale + (zoomDelta * p.z * 2.0);
        
        const finalX = zOriginX + vecX * parallaxScale;
        const finalY = zOriginY + vecY * parallaxScale;

        const depthSizeMultiplier = 1 + (p.z * zoomDelta * 0.5); 
        
        // Overexposure Simulation: Expand sprite size if brightness > 2
        const bloomMultiplier = isOverexposed ? (1 + (brightness - 2.0) * 0.5) : 1.0;
        
        const spriteScaleFactor = featheringMultiplier * bloomMultiplier; 
        
        const coreSize = (baseSize * internalSizeMultiplier) * p.scale * resolutionScale * depthSizeMultiplier;
        const finalSpriteSize = coreSize * spriteScaleFactor * 8; 

        if (finalX < -finalSpriteSize || finalX > cW + finalSpriteSize || 
            finalY < -finalSpriteSize || finalY > cH + finalSpriteSize) continue;

        ctx.drawImage(
          sprite,
          finalX - finalSpriteSize / 2, 
          finalY - finalSpriteSize / 2, 
          finalSpriteSize, 
          finalSpriteSize
        );
      }
    }
    
    ctx.restore();

    if (!isRecording && imageBase64) {
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const chSize = 10;
      ctx.moveTo(zOriginX - chSize, zOriginY);
      ctx.lineTo(zOriginX + chSize, zOriginY);
      ctx.moveTo(zOriginX, zOriginY - chSize);
      ctx.lineTo(zOriginX, zOriginY + chSize);
      ctx.stroke();
      ctx.restore();
    }

  }, [animationConfig, particleConfig, activeParticles, isRecording, imageBase64]);

  const animate = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const dt = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;

    if (isPlaying && !isRecording) {
      setPlaybackProgress(prev => {
        let next = prev + (dt / animationConfig.duration);
        if (next >= 1) next = 0; 
        return next;
      });
    } else if (isRecording) {
       setPlaybackProgress(prev => {
        const next = prev + (dt / animationConfig.duration);
        if (next >= 1) return 1; 
        return next;
      });
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, isRecording, animationConfig.duration]);

  useEffect(() => {
    drawFrame(playbackProgress);
  }, [playbackProgress, drawFrame]);

  useEffect(() => {
    lastTimeRef.current = 0;
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  useEffect(() => {
    if (isRecording) {
      setPlaybackProgress(0);
      setIsPlaying(true);
      lastTimeRef.current = 0;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const stream = canvas.captureStream(30);
      
      // Determine optimal MIME type based on export format
      let mimeType = 'video/webm;codecs=vp9';
      const requestedFormat = videoConfig.format;

      if (requestedFormat === 'mp4' || requestedFormat === 'mov') {
         if (MediaRecorder.isTypeSupported('video/mp4')) {
             mimeType = 'video/mp4'; // Chrome/Edge/Safari support
         } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')) {
             mimeType = 'video/mp4;codecs=h264,aac';
         } else {
             console.warn('MP4 native recording not supported, falling back to WebM container (will be saved with .mp4 extension)');
             // Fallback to default
         }
      } else if (requestedFormat === 'mkv') {
         if (MediaRecorder.isTypeSupported('video/x-matroska')) {
             mimeType = 'video/x-matroska';
         }
      }

      const options: MediaRecorderOptions = {
        mimeType: mimeType,
        bitsPerSecond: videoConfig.bitrate * 1000000 
      };

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        console.warn('Failed to create recorder with options', options, e);
        // Absolute fallback
        recorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Blob Type should generally match what we asked for, or default
        const blobType = mediaRecorderRef.current?.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        const url = URL.createObjectURL(blob);
        onRecordingComplete(url);
        setIsPlaying(false);
      };

      recorder.start();
      
      const durationMs = animationConfig.duration * 1000;
      const timeout = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, durationMs + 200); 

      return () => {
        clearTimeout(timeout);
        if (recorder.state === 'recording') recorder.stop();
      };
    }
  }, [isRecording, animationConfig.duration, videoConfig.bitrate, videoConfig.format, onRecordingComplete]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setPlaybackProgress(val);
    if (isPlaying) setIsPlaying(false); 
  };

  return (
    <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-space-700 bg-black shadow-2xl flex items-center justify-center group">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        width={canvasSize.width}
        height={canvasSize.height}
        className={`max-w-full max-h-full object-contain ${!isRecording && imageBase64 ? 'cursor-crosshair' : ''}`}
        style={{ width: '100%', height: '100%' }} 
      />
      {!imageBase64 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-space-highlight bg-space-800/50 backdrop-blur-sm p-4 text-center">
          <p className="text-base md:text-lg font-light">Upload a nebula image to begin</p>
        </div>
      )}

      {imageBase64 && !isRecording && (
        <div className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
          <div className="flex items-center gap-3">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors"
            >
              {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
            </button>
            
            <div className="flex-1 flex flex-col justify-end">
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.001"
                value={playbackProgress}
                onChange={handleSeek}
                onClick={(e) => e.stopPropagation()} 
                className="w-full accent-space-accent h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              />
               <div className="flex justify-between text-[10px] text-gray-300 mt-1 font-mono">
                  <span>{(playbackProgress * animationConfig.duration).toFixed(1)}s</span>
                  <span>{animationConfig.duration}s</span>
               </div>
            </div>

            <button 
              onClick={(e) => { e.stopPropagation(); setPlaybackProgress(0); setIsPlaying(true); }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors"
              title="Restart"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[10px] text-center text-gray-500 mt-2">Click anywhere on image to set Zoom Center</div>
        </div>
      )}
    </div>
  );
};

export default NebulaCanvas;

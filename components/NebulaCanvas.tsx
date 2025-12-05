
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
  zoomOrigin: { x: number; y: number }; // Received from parent
  onSetZoomOrigin?: (x: number, y: number) => void;
  onImageReady?: () => void; // Handshake signal
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
  zoomOrigin,
  onSetZoomOrigin,
  onImageReady
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
  const [isMobile, setIsMobile] = useState(false);
  
  // Track image load status
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Improved Star Sprite: Core Highlight + Blur + Feathering Logic
  const createStarSprite = (color: string, feathering: number) => {
    const cacheKey = `${color}_${feathering.toFixed(1)}`;
    
    // Check Cache
    if (spriteCacheRef.current.has(cacheKey)) {
      return spriteCacheRef.current.get(cacheKey)!;
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

    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, radius);
    
    // Gradient Stops Logic
    grad.addColorStop(0.0, '#FFFFFF'); 
    grad.addColorStop(0.15, '#FFFFFF'); 
    grad.addColorStop(0.3, color);
    
    let edgeStop = 1.0;
    if (feathering < 0) {
      const t = Math.abs(feathering) / 3.0; 
      edgeStop = 1.0 - (t * 0.65); 
    }

    const fadeColor = color.length === 7 ? `${color}40` : color;
    const fadePoint = 0.6 * edgeStop;
    grad.addColorStop(Math.max(0.31, fadePoint), fadeColor);
    grad.addColorStop(edgeStop, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    
    spriteCacheRef.current.set(cacheKey, canvas);
    return canvas;
  };

  useEffect(() => {
    if (spriteCacheRef.current.size > 200) {
      spriteCacheRef.current.clear();
    }
    starSpriteRef.current = createStarSprite(particleConfig.color, particleConfig.feathering);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particleConfig.color, particleConfig.feathering]);

  // Image Loading Logic
  useEffect(() => {
    // Reset state on new image
    setIsImageLoaded(false);
    imageRef.current = null; 

    if (imageBase64) {
      const img = new Image();
      img.src = imageBase64;
      img.onload = () => {
        imageRef.current = img;
        updateCanvasSize(img, videoConfig.resolution, isRecording);
        setIsImageLoaded(true);
        // Note: We do NOT call onImageReady here directly anymore to avoid race conditions.
        // The useEffect below handles it.
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageBase64, isMobile]); // Remove onImageReady from dependencies here

  // Handshake Synchronization Effect
  // This ensures that if the image is loaded AND the parent is ready to receive the signal (onImageReady exists),
  // we fire the signal. This covers both "Image just loaded" and "Image was already loaded when export started" cases.
  useEffect(() => {
    if (isImageLoaded && onImageReady) {
        // Small timeout to ensure the render cycle is complete
        const t = setTimeout(() => {
            onImageReady();
        }, 50);
        return () => clearTimeout(t);
    }
  }, [isImageLoaded, onImageReady]);


  useEffect(() => {
    setPlaybackProgress(0);
    setIsPlaying(true);
    lastTimeRef.current = 0;
  }, [triggerPreview]); 

  useEffect(() => {
    if (imageRef.current) {
      updateCanvasSize(imageRef.current, videoConfig.resolution, isRecording);
    }
  }, [videoConfig.resolution, isRecording, isMobile]);

  const updateCanvasSize = (img: HTMLImageElement, resolution: string, recording: boolean) => {
    const aspect = img.naturalWidth / img.naturalHeight;
    let w = img.naturalWidth;
    let h = img.naturalHeight;

    if (recording) {
      if (resolution === '1080p') {
        if (w > h) { w = 1920; h = 1920 / aspect; } 
        else { h = 1080; w = 1080 * aspect; }
      } else if (resolution === '4k') {
        if (w > h) { w = 3840; h = 3840 / aspect; }
        else { h = 2160; w = 2160 * aspect; }
      }
    } else {
      const MOBILE_MAX_WIDTH = 1080;
      if (isMobile && w > MOBILE_MAX_WIDTH) {
         w = MOBILE_MAX_WIDTH;
         h = MOBILE_MAX_WIDTH / aspect;
      } else {
         if (resolution === '1080p') {
            if (w > h) { w = 1920; h = 1920 / aspect; } 
            else { h = 1080; w = 1080 * aspect; }
         } else if (resolution === '4k') {
            if (w > h) { w = 3840; h = 3840 / aspect; }
            else { h = 2160; w = 2160 * aspect; }
         }
      }
    }

    w = Math.floor(w / 2) * 2;
    h = Math.floor(h / 2) * 2;

    setCanvasSize({ width: w, height: h });
  };

  useEffect(() => {
    const MAX_PARTICLES = isMobile ? 1500 : 3500;

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
  }, [detectedParticles, particleConfig.density, isMobile]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSetZoomOrigin || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onSetZoomOrigin(x, y);
  };

  const drawFrame = useCallback((progress: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false }); 
    if (!canvas || !ctx || !imageRef.current) return;

    const cW = canvas.width;
    const cH = canvas.height;
    
    // Safety check for empty canvas dimensions
    if (cW === 0 || cH === 0) return;
    
    const zOriginX = zoomOrigin.x * cW;
    const zOriginY = zoomOrigin.y * cH;

    const elapsedSeconds = progress * animationConfig.duration;

    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cW, cH);

    const dir = animationConfig.rotationDirection === 'cw' ? 1 : -1;
    const rotation = (elapsedSeconds * (animationConfig.rotationSpeed * 0.2) * dir * Math.PI) / 180;
    
    const currentScale = animationConfig.initialScale + (animationConfig.finalScale - animationConfig.initialScale) * progress;

    ctx.save();
    ctx.translate(cW / 2, cH / 2);
    ctx.rotate(rotation);
    ctx.translate(-cW / 2, -cH / 2);
    
    // --- 1. Draw Background ---
    ctx.save(); 
    ctx.translate(zOriginX, zOriginY);
    ctx.scale(currentScale, currentScale);
    ctx.translate(-zOriginX, -zOriginY);

    ctx.globalAlpha = 1.0;
    ctx.drawImage(imageRef.current, 0, 0, cW, cH);
    ctx.restore(); 

    // --- 2. Draw Particles ---
    const { baseSize, feathering, brightness } = particleConfig;
    const canvasDiagonal = Math.sqrt(cW * cW + cH * cH);
    const refDiagonal = Math.sqrt(800 * 600);
    const resolutionScale = canvasDiagonal / refDiagonal;

    ctx.globalCompositeOperation = 'screen'; 
    ctx.globalAlpha = Math.min(1, brightness); 

    const zoomDelta = currentScale - animationConfig.initialScale;
    const internalSizeMultiplier = 0.25;

    let spriteScaleMultiplier = 1.0;
    if (feathering >= 0) {
      spriteScaleMultiplier = 1.0 + feathering;
    } else {
      spriteScaleMultiplier = 1.0;
    }

    const brightnessBloom = brightness > 1.5 ? (1 + (brightness - 1.5) * 0.5) : 1.0;

    if (baseSize > 0 && brightness > 0) {
      const pLen = activeParticles.length;
      for (let i = 0; i < pLen; i++) {
        const p = activeParticles[i];

        let sprite = starSpriteRef.current;
        if (p.color) {
           sprite = createStarSprite(p.color, feathering);
        } else {
           sprite = createStarSprite(particleConfig.color, feathering);
        }
        if (!sprite) continue;

        const pX = p.x * cW;
        const pY = p.y * cH;
        
        const vecX = pX - zOriginX;
        const vecY = pY - zOriginY;
        const parallaxScale = currentScale + (zoomDelta * p.z * 2.0);
        const finalX = zOriginX + vecX * parallaxScale;
        const finalY = zOriginY + vecY * parallaxScale;
        
        const margin = 100 * resolutionScale;
        if (finalX < -margin || finalX > cW + margin || 
            finalY < -margin || finalY > cH + margin) continue;

        const depthSizeMultiplier = 1 + (p.z * zoomDelta * 0.5); 
        const spriteScaleFactor = spriteScaleMultiplier * brightnessBloom; 
        const coreSize = (baseSize * internalSizeMultiplier) * p.scale * resolutionScale * depthSizeMultiplier;
        const finalSpriteSize = coreSize * spriteScaleFactor * 8; 
        
        if (finalSpriteSize < 0.5) continue;

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

  }, [animationConfig, particleConfig, activeParticles, isRecording, imageBase64, zoomOrigin]);

  const animate = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const dt = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;

    const safeDt = Math.min(dt, 0.1);

    if (isPlaying && !isRecording) {
      setPlaybackProgress(prev => {
        let next = prev + (safeDt / animationConfig.duration);
        if (next >= 1) next = 0; 
        return next;
      });
    } else if (isRecording) {
       setPlaybackProgress(prev => {
        const next = prev + (safeDt / animationConfig.duration);
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

  // Video Recording Logic
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    
    if (isRecording && isImageLoaded) {
      setPlaybackProgress(0);
      setIsPlaying(true);
      lastTimeRef.current = 0;
      chunksRef.current = [];

      const canvas = canvasRef.current;
      if (!canvas) return;
      
      // Wait a frame for paint
      timeout = setTimeout(() => {
         drawFrame(0);

         const stream = canvas.captureStream(videoConfig.fps);
         
         let mimeType = 'video/webm;codecs=vp9';
         const requestedFormat = videoConfig.format;
         if (requestedFormat === 'mp4' || requestedFormat === 'mov') {
            if (MediaRecorder.isTypeSupported('video/mp4')) {
                mimeType = 'video/mp4'; 
            } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')) {
                mimeType = 'video/mp4;codecs=h264,aac';
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
           recorder = new MediaRecorder(stream);
         }
         
         mediaRecorderRef.current = recorder;

         recorder.ondataavailable = (e) => {
           if (e.data.size > 0) chunksRef.current.push(e.data);
         };

         recorder.onstop = () => {
           const blobType = mediaRecorderRef.current?.mimeType || 'video/webm';
           const blob = new Blob(chunksRef.current, { type: blobType });
           const url = URL.createObjectURL(blob);
           onRecordingComplete(url);
           setIsPlaying(false);
         };

         if (recorder.state === 'inactive') {
            recorder.start();
         }

         const durationMs = animationConfig.duration * 1000;
         setTimeout(() => {
           if (recorder.state === 'recording') recorder.stop();
         }, durationMs + 500); 

      }, 200); // Increased safety timeout slightly
    }

    return () => {
      if (timeout) clearTimeout(timeout);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording, isImageLoaded, animationConfig.duration, videoConfig.bitrate, videoConfig.format, videoConfig.fps, onRecordingComplete]);

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
                className="w-full accent-space-accent h-1 bg-white/20 rounded-lg appearance-none cursor-pointer touch-none"
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

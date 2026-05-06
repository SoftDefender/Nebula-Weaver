import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AnimationConfig, ParticleConfig, NebulaAnalysis, Particle, VideoConfig } from '../types';
import { PlayIcon, PauseIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import {
  canStartRecording,
  resolveRecordingMimeType,
  sanitizeRecordingSettings,
  createRecorderOptions,
  hasUsableRecordingChunks,
  chooseEffectiveExportFormat
} from '../services/nebulaRecording';

interface NebulaCanvasProps {
  imageBase64: string | null;
  particleConfig: ParticleConfig;
  animationConfig: AnimationConfig;
  videoConfig: VideoConfig;
  analysis: NebulaAnalysis | undefined;
  detectedParticles: Particle[] | null; 
  isRecording: boolean;
  onRecordingComplete: (url: string, mimeType: string) => void;
  onRecordingError?: (reason: string) => void;
  zoomOrigin: { x: number; y: number }; // Received from parent
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
  onRecordingError,
  zoomOrigin,
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
  const hasCompletedRef = useRef(false); // Lock to prevent double-firing completion
  
  // Ref for recording progress to bypass React state updates during high-load encoding
  const recordingProgressRef = useRef(0);
  const playbackProgressRef = useRef(0);
  const lastUiProgressCommitRef = useRef(0);
  const drawingInProgressRef = useRef(false);
  const recordingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // Negative feathering tightens the gradient (Sharpening/Contraction)
      // Map -3.0 to ~0.35 stop position
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
    hasCompletedRef.current = false; // Reset lock

    if (imageBase64) {
      const img = new Image();
      img.src = imageBase64;
      img.onload = () => {
        imageRef.current = img;
        updateCanvasSize(img, videoConfig.resolution, isRecording);
        setIsImageLoaded(true);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageBase64, isMobile]); 

  useEffect(() => {
    setPlaybackProgress(0);
    playbackProgressRef.current = 0;
    lastUiProgressCommitRef.current = 0;
    setIsPlaying(true);
    lastTimeRef.current = 0;
  }, [imageBase64]); 

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
      // Force 1080p max on mobile even if export is recording, to prevent GPU crash
      if (isMobile) {
        if (w > h) { w = 1920; h = 1920 / aspect; } 
        else { h = 1080; w = 1080 * aspect; }
      } else {
        if (resolution === '1080p') {
          if (w > h) { w = 1920; h = 1920 / aspect; } 
          else { h = 1080; w = 1080 * aspect; }
        } else if (resolution === '4k') {
          if (w > h) { w = 3840; h = 3840 / aspect; }
          else { h = 2160; w = 2160 * aspect; }
        }
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

    w = Math.max(2, Math.round(w));
    h = Math.max(2, Math.round(h));

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
          // Discrete random size and brightness (alpha)
          const scale = 0.3 + Math.pow(Math.random(), 2) * 1.5; // Skew towards smaller, some distinct large
          const alpha = 0.4 + Math.random() * 0.6; // Discrete brightness variance

          particles.push({
            x: Math.random(),
            y: Math.random(),
            z: z, 
            scale: scale,
            alpha: alpha 
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
    if (drawingInProgressRef.current) return;
    drawingInProgressRef.current = true;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false }); 
    if (!canvas || !ctx || !imageRef.current) {
        drawingInProgressRef.current = false;
        return;
    }

    const cW = canvas.width;
    const cH = canvas.height;
    
    // Safety check for empty canvas dimensions
    if (cW === 0 || cH === 0) {
        drawingInProgressRef.current = false;
        return;
    }
    
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
    const { baseSize, feathering, brightness, spikeGain, spikeThreshold, spikeAngle } = particleConfig;
    const canvasDiagonal = Math.sqrt(cW * cW + cH * cH);
    const refDiagonal = Math.sqrt(800 * 600);
    const resolutionScale = canvasDiagonal / refDiagonal;

    ctx.globalCompositeOperation = 'screen'; 
    const baseAlpha = Math.min(1, brightness);
    ctx.globalAlpha = baseAlpha;

    const zoomDelta = currentScale - animationConfig.initialScale;
    const internalSizeMultiplier = 0.25;

    let spriteScaleMultiplier = 1.0;
    if (feathering >= 0) {
      spriteScaleMultiplier = 1.0 + feathering;
    } else {
      // Negative feathering: Don't shrink the sprite rect, just use the tighter gradient
      spriteScaleMultiplier = 1.0;
    }

    const brightnessBloom = brightness > 1.5 ? (1 + (brightness - 1.5) * 0.5) : 1.0;
    const defaultSprite = starSpriteRef.current || createStarSprite(particleConfig.color, feathering);
    const colorSpriteCache = new Map<string, HTMLCanvasElement>();
    const margin = 100 * resolutionScale;

    if (baseSize > 0 && brightness > 0) {
      const pLen = activeParticles.length;
      for (let i = 0; i < pLen; i++) {
        const p = activeParticles[i];

        // Apply individual particle alpha if present (procedural variance)
        ctx.globalAlpha = p.alpha !== undefined ? Math.min(1, baseAlpha * p.alpha) : baseAlpha;

        let sprite = defaultSprite;
        if (p.color) {
          const cached = colorSpriteCache.get(p.color);
          if (cached) {
            sprite = cached;
          } else {
            const generated = createStarSprite(p.color, feathering);
            colorSpriteCache.set(p.color, generated);
            sprite = generated;
          }
        }
        if (!sprite) continue;

        const pX = p.x * cW;
        const pY = p.y * cH;
        
        const vecX = pX - zOriginX;
        const vecY = pY - zOriginY;
        const parallaxScale = currentScale + (zoomDelta * p.z * 2.0);
        const finalX = zOriginX + vecX * parallaxScale;
        const finalY = zOriginY + vecY * parallaxScale;
        
        if (finalX < -margin || finalX > cW + margin || 
            finalY < -margin || finalY > cH + margin) continue;

        const depthSizeMultiplier = 1 + (p.z * zoomDelta * 0.5); 
        const spriteScaleFactor = spriteScaleMultiplier * brightnessBloom; 
        const coreSize = (baseSize * internalSizeMultiplier) * p.scale * resolutionScale * depthSizeMultiplier;
        const finalSpriteSize = coreSize * spriteScaleFactor * 8; 
        
        if (finalSpriteSize < 0.5) continue;

        // Draw Star Body
        ctx.drawImage(
          sprite,
          finalX - finalSpriteSize / 2, 
          finalY - finalSpriteSize / 2, 
          finalSpriteSize, 
          finalSpriteSize
        );

        // --- 3. Draw Star Spikes (Diffraction) ---
        // Threshold check: Apparent brightness/size vs threshold
        const apparentIntensity = p.scale * brightness;
        
        if (spikeGain > 0 && apparentIntensity > spikeThreshold) {
            // Decouple spike dimensions from feathering to keep them sharp and not bloated
            // Use coreSize (physics size) and brightness for spike dimensions
            const unfeatheredSize = coreSize * brightnessBloom * 8;
            
            // Length scales with Gain, use multiplier to extend beyond the glow
            const spikeLen = unfeatheredSize * (1.5 + spikeGain * 5.0); 
            const halfSpike = spikeLen / 2;
            
            // Width is kept very thin relative to size to appear sharp
            const spikeWidth = unfeatheredSize * 0.035; 

            ctx.save();
            ctx.translate(finalX, finalY);
            
            // Apply configured rotation
            if (spikeAngle && spikeAngle !== 0) {
                ctx.rotate((spikeAngle * Math.PI) / 180);
            }
            
            ctx.fillStyle = p.color || particleConfig.color || '#FFFFFF';
            // Use lighter composite for spikes
            ctx.globalCompositeOperation = 'screen';
            // Fade spikes slightly based on how much they exceed threshold for smoother transition
            const spikeOpacity = Math.min(1, (apparentIntensity - spikeThreshold) * 0.5);
            ctx.globalAlpha = Math.min(1, brightness * 0.9 * spikeOpacity);

            // Horizontal Spike
            ctx.beginPath();
            ctx.moveTo(-halfSpike, 0);
            ctx.quadraticCurveTo(0, -spikeWidth, halfSpike, 0);
            ctx.quadraticCurveTo(0, spikeWidth, -halfSpike, 0);
            ctx.fill();

            // Vertical Spike
            ctx.beginPath();
            ctx.moveTo(0, -halfSpike);
            ctx.quadraticCurveTo(-spikeWidth, 0, 0, halfSpike);
            ctx.quadraticCurveTo(spikeWidth, 0, 0, -halfSpike);
            ctx.fill();

            ctx.restore();
        }
      }
    }
    
    ctx.restore();

    if (!isRecording && imageBase64) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; // Brighter crosshair for contrast
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
    
    drawingInProgressRef.current = false;

  }, [animationConfig, particleConfig, activeParticles, isRecording, imageBase64, zoomOrigin]);

  const animate = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const dt = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;

    const safeDt = Math.min(dt, 0.1);

    if (isPlaying && !isRecording) {
      const duration = Math.max(animationConfig.duration, 0.001);
      let next = playbackProgressRef.current + (safeDt / duration);
      if (next >= 1) next = 0;
      playbackProgressRef.current = next;
      drawFrame(next);

      // Throttle UI updates to reduce component re-render pressure during playback.
      if (time - lastUiProgressCommitRef.current >= 80 || next === 0) {
        lastUiProgressCommitRef.current = time;
        setPlaybackProgress(next);
      }
    } else if (isRecording) {
       // Direct Drive for Recording: Bypass React State to avoid frame drops on mobile
       const duration = animationConfig.duration;
       let next = recordingProgressRef.current + (safeDt / duration);
       if (next > 1) next = 1;
       
       recordingProgressRef.current = next;
       // Directly call drawFrame without triggering a re-render
       drawFrame(next);
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, isRecording, animationConfig.duration, drawFrame]);

  const clearRecordingStopTimeout = useCallback(() => {
    if (recordingStopTimeoutRef.current) {
      clearTimeout(recordingStopTimeoutRef.current);
      recordingStopTimeoutRef.current = null;
    }
  }, []);

  const handleRecordingFailure = useCallback(
    (reason: string) => {
      if (hasCompletedRef.current) return;
      hasCompletedRef.current = true;
      clearRecordingStopTimeout();
      setIsPlaying(false);
      onRecordingError?.(reason);
    },
    [clearRecordingStopTimeout, onRecordingError]
  );

  useEffect(() => {
    // Allow paused scrubbing/parameter edits to redraw without forcing full-rate React updates.
    if (!isRecording && !isPlaying) {
      drawFrame(playbackProgressRef.current);
    }
  }, [drawFrame, isRecording, isPlaying, playbackProgress]);

  useEffect(() => {
    lastTimeRef.current = 0;
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  // Video Recording Logic
  useEffect(() => {
    if (isRecording && isImageLoaded) {
      hasCompletedRef.current = false;
      setPlaybackProgress(0);
      playbackProgressRef.current = 0;
      recordingProgressRef.current = 0; // Reset direct drive ref
      lastUiProgressCommitRef.current = 0;
      clearRecordingStopTimeout();
      
      setIsPlaying(true);
      lastTimeRef.current = 0;
      chunksRef.current = [];
      
      const canvas = canvasRef.current;
      if (!canvas) {
        handleRecordingFailure('canvas-unavailable');
        return;
      }
      
      // Warm-up sequence: Draw frame 0 twice to ensure buffer is flushed
      requestAnimationFrame(() => {
        drawFrame(0);
        requestAnimationFrame(() => {
             drawFrame(0);
             
             const { fps: safeFPS, bitrateMbps: safeBitrate } = sanitizeRecordingSettings(
               videoConfig.fps,
               videoConfig.bitrate,
               isMobile
             );
             
             if (safeFPS !== videoConfig.fps || safeBitrate !== videoConfig.bitrate) {
               console.warn(
                 `[Recording Optimization] Clamping export settings: FPS ${videoConfig.fps}->${safeFPS}, Bitrate ${videoConfig.bitrate}->${safeBitrate}Mbps`
               );
             }

              const pixelCount = canvas.width * canvas.height;
              const formatDecision = chooseEffectiveExportFormat(videoConfig.format, pixelCount);
              if (formatDecision.downgraded) {
                console.warn(
                  `[Recording Compatibility] Format downgraded ${videoConfig.format}->${formatDecision.format}. reason=${formatDecision.reason}`
                );
              }

              // --- Recording Start ---
              const stream = canvas.captureStream(safeFPS);
              if (!canStartRecording(stream)) {
                 console.error("Stream failed to initialize or has no tracks.");
                handleRecordingFailure('capture-stream-not-recordable');
                return;
             }

              const requestedFormat = formatDecision.format;
              const resolvedMimeType = resolveRecordingMimeType(requestedFormat);
              if (!resolvedMimeType) {
                console.warn(`No explicit mime type is supported for requested format "${requestedFormat}", using browser default MediaRecorder output.`);
              }
              const options = createRecorderOptions(resolvedMimeType, safeBitrate);
    
              let recorder: MediaRecorder;
              try {
                recorder = new MediaRecorder(stream, options);
              } catch (e) {
               console.warn('Failed to create recorder with options', options, e);
               try {
                 recorder = new MediaRecorder(stream);
               } catch (fallbackErr) {
                 console.error('Failed to create MediaRecorder fallback', fallbackErr);
                 handleRecordingFailure('media-recorder-construction-failed');
                 return;
               }
             }
              
             recorder.onerror = (e) => {
                 console.error("MediaRecorder Error:", e);
                 handleRecordingFailure('media-recorder-runtime-error');
                 if (recorder.state !== 'inactive') recorder.stop();
              };

             mediaRecorderRef.current = recorder;
    
             recorder.ondataavailable = (e) => {
               if (e.data.size > 0) chunksRef.current.push(e.data);
             };
    
              recorder.onstop = async () => {
                 if (hasCompletedRef.current) return;
                 hasCompletedRef.current = true;
                 clearRecordingStopTimeout();

                 if (!hasUsableRecordingChunks(chunksRef.current)) {
                   stream.getTracks().forEach(track => track.stop());
                   handleRecordingFailure('recording-empty-output');
                   return;
                 }
                 const blobType = mediaRecorderRef.current?.mimeType || resolvedMimeType || 'video/webm';
                 const finalBlob = new Blob(chunksRef.current, { type: blobType });
                 if (finalBlob.size === 0) {
                   stream.getTracks().forEach(track => track.stop());
                   handleRecordingFailure('recording-empty-blob');
                   return;
                 }
                 
                 const url = URL.createObjectURL(finalBlob);
                onRecordingComplete(url, blobType);
                setIsPlaying(false);
                stream.getTracks().forEach(track => track.stop());
              };
    
              if (recorder.state === 'inactive') {
                 // Start without timeslice to preserve stable duration metadata.
                 recorder.start();
              }
    
             const durationMs = animationConfig.duration * 1000;
             recordingStopTimeoutRef.current = setTimeout(() => {
                if (recorder.state === 'recording') recorder.stop();
              }, durationMs + 500); 

        });
      });
    }

    return () => {
      clearRecordingStopTimeout();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording, isImageLoaded, animationConfig.duration, videoConfig.bitrate, videoConfig.format, videoConfig.fps, onRecordingComplete, isMobile, drawFrame, handleRecordingFailure, clearRecordingStopTimeout]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    playbackProgressRef.current = val;
    lastUiProgressCommitRef.current = performance.now();
    setPlaybackProgress(val);
    drawFrame(val);
    if (isPlaying) setIsPlaying(false); 
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center group bg-black">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        width={canvasSize.width}
        height={canvasSize.height}
        className={`max-w-full max-h-full object-contain ${!isRecording && imageBase64 ? 'cursor-crosshair' : ''}`}
        style={{ width: '100%', height: '100%' }} 
      />
      {!imageBase64 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-black/50 p-4 text-center">
          <p className="text-sm font-medium">Upload a nebula image to begin</p>
        </div>
      )}

      {imageBase64 && !isRecording && (
        <div className={`absolute bottom-0 left-0 right-0 p-3 bg-white border-t border-sc-border transition-all duration-300 ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
          <div className="flex items-center gap-3">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
              className="p-2 text-sc-primary hover:scale-110 transition-transform"
            >
              {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
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
                className="w-full cursor-pointer touch-none"
              />
               <div className="flex justify-between text-[10px] text-sc-subtext mt-1 font-medium">
                  <span>{(playbackProgress * animationConfig.duration).toFixed(1)}s</span>
                  <span>{animationConfig.duration}s</span>
               </div>
            </div>

            <button 
              onClick={(e) => {
                e.stopPropagation();
                playbackProgressRef.current = 0;
                lastUiProgressCommitRef.current = 0;
                setPlaybackProgress(0);
                setIsPlaying(true);
              }}
              className="p-2 text-sc-subtext hover:text-sc-primary transition-colors"
              title="Restart"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NebulaCanvas;

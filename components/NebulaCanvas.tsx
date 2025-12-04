
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AnimationConfig, ParticleConfig, NebulaAnalysis, Particle, VideoConfig } from '../types';

interface NebulaCanvasProps {
  imageBase64: string | null;
  particleConfig: ParticleConfig;
  animationConfig: AnimationConfig;
  videoConfig: VideoConfig;
  analysis: NebulaAnalysis | undefined;
  detectedParticles: Particle[] | null; // New Prop
  isRecording: boolean;
  onRecordingComplete: (url: string) => void;
  triggerPreview: number; 
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const imageRef = useRef<HTMLImageElement | null>(null);
  
  // Canvas Resolution State
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  
  // Store particles (either detected or procedural)
  const [activeParticles, setActiveParticles] = useState<Particle[]>([]);

  // 1. Load Image
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

  // 2. Update Canvas Size when Config Changes
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
      // Scale to fit within 1920x1080 while maintaining aspect ratio
      if (w > h) {
        w = 1920;
        h = 1920 / aspect;
      } else {
        h = 1080;
        w = 1080 * aspect;
      }
    } else if (resolution === '4k') {
      // Scale to fit within 3840x2160
      if (w > h) {
        w = 3840;
        h = 3840 / aspect;
      } else {
        h = 2160;
        w = 2160 * aspect;
      }
    }
    // 'original' uses natural dimensions

    // Ensure even dimensions for video encoding compatibility
    w = Math.floor(w / 2) * 2;
    h = Math.floor(h / 2) * 2;

    setCanvasSize({ width: w, height: h });
  };

  // 3. Handle Particle Generation (Detected vs Procedural)
  useEffect(() => {
    // Priority: Detected Stars > Procedural Generation
    if (detectedParticles && detectedParticles.length > 0) {
      // Use the stars found by image analysis (they already have Z values from the service)
      setActiveParticles(detectedParticles);
    } else {
      // Fallback: Generate procedural random stars
      const generateParticles = (count: number) => {
        const particles: Particle[] = [];
        for (let i = 0; i < count; i++) {
          // Weighted Z distribution: More stars in background, fewer in foreground
          // Z ranges roughly 0.0 (far) to 4.0 (very close)
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

  // 4. Animation Loop
  const animate = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !imageRef.current) return;

    if (!startTimeRef.current) startTimeRef.current = time;
    const elapsed = (time - startTimeRef.current) / 1000; // Seconds
    const progress = Math.min(elapsed / animationConfig.duration, 1);

    // Canvas dimensions
    const cW = canvas.width;
    const cH = canvas.height;
    const cx = cW / 2;
    const cy = cH / 2;

    // Setup Canvas
    ctx.clearRect(0, 0, cW, cH);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cW, cH);

    // -- Global Transform --
    // We rotate everything together to mimic a camera roll
    const dir = animationConfig.rotationDirection === 'cw' ? 1 : -1;
    const rotation = (elapsed * (animationConfig.rotationSpeed * 0.2) * dir * Math.PI) / 180;
    
    // Linear interpolation for the Background Nebula Scale
    const currentScale = animationConfig.initialScale + (animationConfig.finalScale - animationConfig.initialScale) * progress;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    
    // -- 1. Draw Background Nebula --
    // The nebula is treated as "infinity", so it scales linearly.
    ctx.save(); 
    ctx.scale(currentScale, currentScale);
    ctx.translate(-cW / 2, -cH / 2); 
    ctx.drawImage(imageRef.current, 0, 0, cW, cH);
    ctx.restore(); 

    // -- 2. Draw Star Particles (3D Parallax) --
    const { baseSize, brightness, color } = particleConfig;
    
    // Reference scale for consistent particle size across resolutions
    const canvasDiagonal = Math.sqrt(cW * cW + cH * cH);
    const refDiagonal = Math.sqrt(800 * 800 + 600 * 600);
    const resolutionScale = canvasDiagonal / refDiagonal;

    ctx.globalCompositeOperation = 'screen'; 
    ctx.fillStyle = color;
    ctx.globalAlpha = brightness;

    // How much has the camera moved?
    // If we are at initialScale, delta is 0. If at finalScale, delta is max.
    const zoomDelta = currentScale - animationConfig.initialScale;

    if (baseSize > 0 && brightness > 0) {
      for (let i = 0; i < activeParticles.length; i++) {
        const p = activeParticles[i];

        // 3D MATH:
        // We simulate objects being closer (high Z) moving FASTER than the background.
        // effectiveScale = BaseScale + (MovementAmount * ParallaxFactor)
        // Multiplying by 2.0 exaggerates the depth effect
        const parallaxScale = currentScale + (zoomDelta * p.z * 3.0);
        
        // Calculate position relative to center
        // p.x is 0..1, so (p.x - 0.5) centers it at 0
        const relX = (p.x - 0.5) * cW;
        const relY = (p.y - 0.5) * cH;

        // Apply Parallax Scale
        const drawX = relX * parallaxScale;
        const drawY = relY * parallaxScale;

        // Calculate Apparent Size
        // Foreground stars (high Z) also grow larger as they approach the camera
        const depthSizeMultiplier = 1 + (p.z * zoomDelta * 0.5); 
        const drawSize = baseSize * p.scale * resolutionScale * depthSizeMultiplier;

        // Simple Frustum Culling (Optional optimization, good for 4K)
        if (Math.abs(drawX) > cW * 1.5 || Math.abs(drawY) > cH * 1.5) continue;

        ctx.beginPath();
        ctx.arc(drawX, drawY, Math.max(0, drawSize), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore(); // Restore global rotation

    // Check Stop for Recording
    if (isRecording && elapsed >= animationConfig.duration) {
       // Stop logic handled by useEffect dependency/timeout
    } else {
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [animationConfig, particleConfig, activeParticles, isRecording]);

  // Handle Play/Preview Loop
  useEffect(() => {
    startTimeRef.current = 0;
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate, triggerPreview, canvasSize]);

  // Handle Recording
  useEffect(() => {
    if (isRecording) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const stream = canvas.captureStream(30);
      
      const options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9',
        bitsPerSecond: videoConfig.bitrate * 1000000 
      };

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        console.warn("VP9/Bitrate configuration failed, falling back to default.", e);
        recorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        onRecordingComplete(url);
      };

      recorder.start();

      const timeout = setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, animationConfig.duration * 1000);

      startTimeRef.current = 0;

      return () => {
        clearTimeout(timeout);
        if (recorder.state === 'recording') recorder.stop();
      };
    }
  }, [isRecording, animationConfig.duration, onRecordingComplete, videoConfig.bitrate]);

  return (
    <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-space-700 bg-black shadow-2xl flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="max-w-full max-h-full object-contain"
        style={{ width: '100%', height: '100%' }} 
      />
      {!imageBase64 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-space-highlight bg-space-800/50 backdrop-blur-sm p-4 text-center">
          <p className="text-base md:text-lg font-light">Upload a nebula image to begin</p>
        </div>
      )}
    </div>
  );
};

export default NebulaCanvas;

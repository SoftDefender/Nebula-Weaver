
import { Particle } from '../types';

/**
 * Analyzes an image to find star-like objects using adaptive thresholding
 * and local contrast isolation (similar to Source Extractor/StarNet concepts).
 */
export const detectStarsFromImage = (
  imageBase64: string, 
): Promise<Particle[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = imageBase64;
    img.onload = () => {
      const startTime = performance.now();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve([]);
        return;
      }

      // 1. Resize for analysis
      // A width of ~1024 strikes a good balance between speed and resolving small stars
      const ANALYSIS_WIDTH = 1024; 
      const scale = Math.min(1, ANALYSIS_WIDTH / img.naturalWidth);
      const width = Math.floor(img.naturalWidth * scale);
      const height = Math.floor(img.naturalHeight * scale);
      
      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // 2. Pre-calculate Luminance Map (Float32 for speed)
      const lumaMap = new Float32Array(width * height);
      let totalLuma = 0;
      let totalSqLuma = 0;
      let sampleCount = 0;

      // We sample statistics to determine the "Background" vs "Signal"
      // Step 4 is a speed optimization for statistics
      for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        // Human perception of luminance
        const val = 0.299 * r + 0.587 * g + 0.114 * b;
        lumaMap[i] = val;

        // Statistics sampling (every 10th pixel)
        if (i % 10 === 0) {
           totalLuma += val;
           totalSqLuma += val * val;
           sampleCount++;
        }
      }

      // 3. Calculate Adaptive Threshold (Sigma Clipping)
      // This mimics N.I.N.A / AstroBin statistics
      const mean = totalLuma / sampleCount;
      const variance = (totalSqLuma / sampleCount) - (mean * mean);
      const stdDev = Math.sqrt(Math.max(0, variance));
      
      // Threshold: Background Mean + (K * Sigma)
      // Higher K = Fewer stars, less noise. Lower K = More stars, more nebula gas detected.
      // 2.0 is a balanced start for astrophotos.
      const THRESHOLD = Math.max(40, mean + (stdDev * 2.5)); 

      const particles: Particle[] = [];
      
      // 4. Scan for Stars
      // We look for peaks. 
      // Logic: A star is a pixel that is:
      // A) Brighter than the Threshold
      // B) A local Maximum (brighter than immediate neighbors)
      // C) "Isolated" (Sharp contrast against a slightly wider ring) - The "StarNet" separation logic
      
      const SCAN_STEP = 2; // Check every 2nd pixel for speed
      const EDGE_MARGIN = 4;
      
      for (let y = EDGE_MARGIN; y < height - EDGE_MARGIN; y += SCAN_STEP) {
        for (let x = EDGE_MARGIN; x < width - EDGE_MARGIN; x += SCAN_STEP) {
          const idx = y * width + x;
          const val = lumaMap[idx];

          if (val < THRESHOLD) continue;

          // Check Local Max (Immediate 3x3)
          if (
            val <= lumaMap[idx - 1] || val <= lumaMap[idx + 1] ||
            val <= lumaMap[idx - width] || val <= lumaMap[idx + width]
          ) {
            continue;
          }

          // Isolation Check (The "StarNet" Logic)
          // We check the average brightness of a ring 3-4 pixels away.
          // If the ring is also very bright, we are likely in a nebula core, not a star.
          // Stars have sharp falloff.
          let ringSum = 0;
          let ringCount = 0;
          const radius = 3;
          
          // Sample 4 points on the ring (Top, Bottom, Left, Right)
          ringSum += lumaMap[idx - radius];
          ringSum += lumaMap[idx + radius];
          ringSum += lumaMap[idx - (width * radius)];
          ringSum += lumaMap[idx + (width * radius)];
          const ringAvg = ringSum / 4;

          // Contrast Ratio: The peak should be significantly brighter than the ring
          if (val - ringAvg < stdDev * 0.5) continue; 

          // If we passed, we have a star.
          
          // Calculate Z-Depth (Tunnel effect distribution)
          // More stars in the back (low Z), fewer in the front (high Z)
          const z = Math.pow(Math.random(), 3) * 5.0;

          // Scale relative to brightness, but clamped
          const detectedScale = Math.min(2.0, Math.max(0.3, (val - ringAvg) / 50));

          particles.push({
            x: x / width, 
            y: y / height, 
            z: z, 
            scale: detectedScale
          });
        }
      }

      console.log(`Detected ${particles.length} stars (Threshold: ${THRESHOLD.toFixed(1)}) in ${(performance.now() - startTime).toFixed(1)}ms`);
      resolve(particles);
    };
    img.onerror = () => resolve([]);
  });
};

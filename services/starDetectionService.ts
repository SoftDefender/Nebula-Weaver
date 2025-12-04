
import { Particle } from '../types';

/**
 * Analyzes an image to find star-like objects using Background Subtraction 
 * (Conceptually similar to PixInsight SXT / StarNet++).
 * 
 * 1. Estimate Background (Nebulosity)
 * 2. Subtract Background from Original
 * 3. Threshold the Residuals to find Stars
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

      // Resize for analysis (Optimization: Lower resolution for faster mobile processing)
      const ANALYSIS_WIDTH = 800; 
      const scale = Math.min(1, ANALYSIS_WIDTH / img.naturalWidth);
      const width = Math.floor(img.naturalWidth * scale);
      const height = Math.floor(img.naturalHeight * scale);
      
      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const pixelCount = width * height;

      // 1. Create Luminance Map
      const luma = new Float32Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        // Perceptual luminance
        luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      }

      // 2. Estimate Background (Simplified Morphological Opening)
      const BLOCK_SIZE = 16; 
      const gridW = Math.ceil(width / BLOCK_SIZE);
      const gridH = Math.ceil(height / BLOCK_SIZE);
      const bgGrid = new Float32Array(gridW * gridH);

      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          let minVal = 255;
          const startX = gx * BLOCK_SIZE;
          const startY = gy * BLOCK_SIZE;
          const endX = Math.min(startX + BLOCK_SIZE, width);
          const endY = Math.min(startY + BLOCK_SIZE, height);

          // Stride 4 for speed
          for (let y = startY; y < endY; y += 4) { 
            for (let x = startX; x < endX; x += 4) {
               const val = luma[y * width + x];
               if (val < minVal) minVal = val;
            }
          }
          bgGrid[gy * gridW + gx] = minVal; 
        }
      }

      // 3. Scan for Stars (Residual = Original - Background)
      const particles: Particle[] = [];
      const SCAN_STEP = 2; 
      
      // Dynamic Thresholding Stats
      let residualSum = 0;
      let residualSqSum = 0;
      let samp = 0;
      
      for (let i = 0; i < pixelCount; i += 100) {
        const x = i % width;
        const y = Math.floor(i / width);
        const gx = Math.floor(x / BLOCK_SIZE);
        const gy = Math.floor(y / BLOCK_SIZE);
        const bgVal = bgGrid[gy * gridW + gx];
        
        const residual = Math.max(0, luma[i] - bgVal);
        residualSum += residual;
        residualSqSum += residual * residual;
        samp++;
      }
      
      const resMean = residualSum / samp;
      const resStd = Math.sqrt((residualSqSum / samp) - (resMean * resMean));
      const THRESHOLD = resMean + (resStd * 3.0); 

      for (let y = 2; y < height - 2; y += SCAN_STEP) {
        for (let x = 2; x < width - 2; x += SCAN_STEP) {
          const idx = y * width + x;
          const gx = Math.floor(x / BLOCK_SIZE);
          const gy = Math.floor(y / BLOCK_SIZE);
          
          const bg = bgGrid[gy * gridW + gx];
          const val = luma[idx];
          const residual = val - bg;

          if (residual < THRESHOLD) continue;

          // Local Maxima Check
          if (
             luma[idx] <= luma[idx - 1] || luma[idx] <= luma[idx + 1] ||
             luma[idx] <= luma[idx - width] || luma[idx] <= luma[idx + width]
          ) continue;

          const r = data[idx * 4];
          const g = data[idx * 4 + 1];
          const b = data[idx * 4 + 2];
          const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

          const z = Math.pow(Math.random(), 3) * 5.0;
          const scaleVal = Math.min(2.0, Math.max(0.2, (residual - THRESHOLD) / 50));

          particles.push({
            x: x / width,
            y: y / height,
            z: z,
            scale: scaleVal,
            color: hex
          });
        }
      }

      console.log(`Detected ${particles.length} stars in ${(performance.now() - startTime).toFixed(1)}ms`);
      
      // Memory cleanup hint
      canvas.width = 0;
      canvas.height = 0;
      
      resolve(particles);
    };
    img.onerror = () => resolve([]);
  });
};


import { Particle } from '../types';

/**
 * Analyzes an image to find star-like objects.
 * Logic roughly mimics the "detection" phase of star removal tools:
 * 1. Convert to grayscale/luminance.
 * 2. Look for local maxima (pixels brighter than neighbors).
 * 3. Filter by a minimum threshold to ignore nebula gas.
 */
export const detectStarsFromImage = (
  imageBase64: string, 
  canvasWidth: number = 800
): Promise<Particle[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = imageBase64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve([]);
        return;
      }

      // Scale down slightly for performance, but keep enough res to see stars
      const scale = Math.min(1, 1024 / img.naturalWidth);
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = canvas.width;
      const height = canvas.height;

      const particles: Particle[] = [];
      
      // Parameters for detection
      // Nebulae are bright, so threshold must be relatively high to catch only stars
      const BRIGHTNESS_THRESHOLD = 180; // 0-255
      const SEARCH_STEP = 2; // Skip pixels to speed up
      const WINDOW_SIZE = 2; // Check +/- 2 pixels for local maximum

      // Helper to get luminance
      const getLuma = (idx: number) => {
        return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      };

      for (let y = WINDOW_SIZE; y < height - WINDOW_SIZE; y += SEARCH_STEP) {
        for (let x = WINDOW_SIZE; x < width - WINDOW_SIZE; x += SEARCH_STEP) {
          const i = (y * width + x) * 4;
          const luma = getLuma(i);

          // 1. Basic Threshold check (ignore dark space and dim gas)
          if (luma < BRIGHTNESS_THRESHOLD) continue;

          // 2. Local Maximum check (StarNet logic: Stars are high-freq peaks)
          let isLocalMax = true;
          for (let dy = -WINDOW_SIZE; dy <= WINDOW_SIZE; dy++) {
            for (let dx = -WINDOW_SIZE; dx <= WINDOW_SIZE; dx++) {
              if (dx === 0 && dy === 0) continue;
              const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
              if (getLuma(neighborIdx) >= luma) {
                isLocalMax = false;
                break;
              }
            }
            if (!isLocalMax) break;
          }

          if (isLocalMax) {
            // Found a star!
            // Z-Depth Assignment for 3D Parallax:
            // To create depth, stars shouldn't just sit on the canvas (Z=0).
            // We assign Z randomly. 
            // Low Z (e.g. 0.0) -> Moves with background (Infinity)
            // High Z (e.g. 5.0) -> Moves very fast (Foreground)
            
            // Use cubic distribution to keep most stars near the background (Nebula)
            // and fewer stars rushing past the camera.
            const z = Math.pow(Math.random(), 3) * 5.0;

            particles.push({
              x: x / width, // Normalize 0-1
              y: y / height, // Normalize 0-1
              z: z, 
              // Scale size based slightly on brightness, but keep random variation
              scale: (luma / 255) * (0.5 + Math.random()), 
            });
          }
        }
      }

      console.log(`Detected ${particles.length} stars.`);
      resolve(particles);
    };
    img.onerror = () => resolve([]);
  });
};

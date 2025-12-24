
import { ImageFormat } from '../types';

/**
 * Compresses an image to fit under a specified size in KB.
 * Uses binary search on the quality parameter for JPEG/WEBP.
 * For PNG, it just performs standard canvas output as PNG doesn't support quality loss in toBlob.
 */
export const compressImageToTarget = async (
  file: File,
  targetSizeKB: number,
  outputFormat: 'original' | ImageFormat
): Promise<Blob> => {
  const targetBytes = targetSizeKB * 1024;
  const mimeType = outputFormat === 'original' ? file.type : outputFormat;
  
  // Load image
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get canvas context");
  ctx.drawImage(img, 0, 0);

  // If PNG, we can't really do quality-based compression in standard canvas API
  // We return a standard blob and hope for the best, or suggest JPEG/WEBP
  if (mimeType === 'image/png') {
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    return blob;
  }

  // Binary search for optimal quality (0.0 to 1.0)
  let min = 0.01;
  let max = 1.0;
  let bestBlob: Blob | null = null;
  const iterations = 7; // Enough for ~0.01 precision

  for (let i = 0; i < iterations; i++) {
    const quality = (min + max) / 2;
    const blob = await new Promise<Blob>((resolve) => 
      canvas.toBlob((b) => resolve(b!), mimeType as string, quality)
    );

    if (blob.size <= targetBytes) {
      bestBlob = blob;
      min = quality; // Try higher quality
    } else {
      max = quality; // Need lower quality
    }
  }

  // Fallback: If even the lowest quality is too big, try downsizing the dimensions
  if (!bestBlob) {
    let scale = 0.9;
    while (scale > 0.1) {
      canvas.width = Math.floor(img.naturalWidth * scale);
      canvas.height = Math.floor(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const blob = await new Promise<Blob>((resolve) => 
        canvas.toBlob((b) => resolve(b!), mimeType as string, 0.1)
      );
      
      if (blob.size <= targetBytes) {
        bestBlob = blob;
        break;
      }
      scale -= 0.1;
    }
  }

  if (!bestBlob) {
    // Last resort: return lowest possible quality/size
    return new Promise<Blob>((resolve) => 
      canvas.toBlob((b) => resolve(b!), mimeType as string, 0.01)
    );
  }

  return bestBlob;
};

const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

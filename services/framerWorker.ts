
import { FrameConfig, ImageEditConfig, RenderRequest } from '../types';

// Helper to check for OffscreenCanvas support
const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

/**
 * Creates a canvas (Offscreen or DOM)
 */
const createCanvas = (w: number, h: number): OffscreenCanvas | HTMLCanvasElement => {
    if (hasOffscreenCanvas) {
        return new OffscreenCanvas(w, h);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
};

/**
 * Helper: Process raw image (Rotate/Crop)
 */
const getProcessedImage = (img: ImageBitmap | HTMLImageElement, editConfig: ImageEditConfig): OffscreenCanvas | HTMLCanvasElement => {
    const isVertical = editConfig.rotation === 90 || editConfig.rotation === 270;
    
    // Dimension check
    const naturalWidth = 'naturalWidth' in img ? img.naturalWidth : img.width;
    const naturalHeight = 'naturalHeight' in img ? img.naturalHeight : img.height;

    const w = isVertical ? naturalHeight : naturalWidth;
    const h = isVertical ? naturalWidth : naturalHeight;
    
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) return canvas;

    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate((editConfig.rotation * Math.PI) / 180);
    ctx.scale(editConfig.flipH ? -1 : 1, editConfig.flipV ? -1 : 1);
    
    if (isVertical) {
       ctx.drawImage(img, -naturalWidth/2, -naturalHeight/2);
    } else {
       ctx.drawImage(img, -naturalWidth/2, -naturalHeight/2);
    }
    ctx.restore();

    // Secondary Crop Pass
    if (editConfig.zoom > 1.0 || editConfig.panX !== 0 || editConfig.panY !== 0) {
        const croppedCanvas = createCanvas(w, h);
        const cCtx = croppedCanvas.getContext('2d') as CanvasRenderingContext2D;
        if (cCtx) {
           const zoom = editConfig.zoom;
           const vw = w / zoom;
           const vh = h / zoom;
           
           const cx = w/2 - (editConfig.panX / 100) * (w/2);
           const cy = h/2 - (editConfig.panY / 100) * (h/2);
           
           const sx = cx - vw/2;
           const sy = cy - vh/2;
           
           cCtx.drawImage(canvas, sx, sy, vw, vh, 0, 0, w, h);
           return croppedCanvas;
        }
    }
    return canvas;
};

export const renderFrame = async (req: RenderRequest): Promise<Blob | null> => {
    const { imageBitmap, frameConfig, editConfig, quality } = req;
    
    const processedCanvas = getProcessedImage(imageBitmap, editConfig);
    const finalW = processedCanvas.width;
    const finalH = processedCanvas.height;
    
    // Determine Output Size
    let cw = finalW;
    let ch = finalH;

    if (frameConfig.aspectRatio === 'custom') {
       if (frameConfig.customWidth && frameConfig.customHeight) {
          const targetW = frameConfig.customWidth;
          const targetH = frameConfig.customHeight;
          const targetRatio = targetW / targetH;
          const imgRatio = finalW / finalH;
          
          if (imgRatio > targetRatio) {
             cw = finalW;
             ch = cw / targetRatio;
          } else {
             ch = finalH;
             cw = ch * targetRatio;
          }
       }
    } else if (frameConfig.aspectRatio !== 'original') {
        const [rw, rh] = frameConfig.aspectRatio.split(':').map(Number);
        const targetRatio = rw / rh;
        const imgRatio = finalW / finalH;

        if (imgRatio > targetRatio) {
           cw = finalW;
           ch = cw / targetRatio;
        } else {
           ch = finalH;
           cw = ch * targetRatio;
        }
    }

    // Resolution scaling
    let scaleFactor = 1.0;
    if (quality === 'preview') {
        const MAX_PREVIEW = 1200; // Slightly larger for crisp previews
        if (cw > MAX_PREVIEW || ch > MAX_PREVIEW) {
            scaleFactor = Math.min(MAX_PREVIEW/cw, MAX_PREVIEW/ch);
            cw *= scaleFactor;
            ch *= scaleFactor;
        }
    }

    const outputCanvas = createCanvas(cw, ch);
    const ctx = outputCanvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) return null;

    // --- Draw Logic ---
    
    // Background
    ctx.save();
    const imgRatio = finalW / finalH;
    const canvasRatio = cw / ch;
    
    let bgW, bgH, bgX, bgY;
    if (canvasRatio > imgRatio) {
        bgW = cw;
        bgH = cw / imgRatio;
        bgX = 0;
        bgY = (ch - bgH) / 2;
    } else {
        bgH = ch;
        bgW = ch * imgRatio;
        bgY = 0;
        bgX = (cw - bgW) / 2;
    }
    
    const refSize = 1000 * scaleFactor;
    const resScale = Math.max(cw, ch) / refSize;
    
    // Blur Effect
    ctx.filter = `blur(${frameConfig.blurIntensity * resScale}px) saturate(160%) brightness(1.1)`;
    ctx.drawImage(processedCanvas, bgX - (bgW*0.05), bgY - (bgH*0.05), bgW * 1.1, bgH * 1.1);
    ctx.filter = 'none';

    // Overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();

    // Shadow Base
    ctx.fillStyle = frameConfig.shadowColor === 'black' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
    ctx.fillRect(0,0,cw,ch);

    // Foreground
    const marginScale = frameConfig.scale; 
    let fgW, fgH;
    if (canvasRatio > imgRatio) {
        fgH = ch * marginScale;
        fgW = fgH * imgRatio;
    } else {
        fgW = cw * marginScale;
        fgH = fgW / imgRatio;
    }
    const fgX = (cw - fgW) / 2;
    const fgY = (ch - fgH) / 2;

    ctx.save();
    const shadowOpacity = frameConfig.shadowColor === 'black' ? 0.5 : 0.8;
    ctx.shadowColor = frameConfig.shadowColor === 'black' 
        ? `rgba(0,0,0,${shadowOpacity})` 
        : `rgba(255,255,255,${shadowOpacity})`;
    
    ctx.shadowBlur = frameConfig.shadowIntensity * 0.5 * resScale; 
    ctx.shadowOffsetY = frameConfig.shadowIntensity * 0.15 * resScale;
    ctx.shadowOffsetX = 0;
    
    // Rounded Rect
    const radius = (Math.min(fgW, fgH) * (frameConfig.borderRadius / 100)) / 2;
    ctx.beginPath();
    ctx.moveTo(fgX + radius, fgY);
    ctx.lineTo(fgX + fgW - radius, fgY);
    ctx.quadraticCurveTo(fgX + fgW, fgY, fgX + fgW, fgY + radius);
    ctx.lineTo(fgX + fgW, fgY + fgH - radius);
    ctx.quadraticCurveTo(fgX + fgW, fgY + fgH, fgX + fgW - radius, fgY + fgH);
    ctx.lineTo(fgX + radius, fgY + fgH);
    ctx.quadraticCurveTo(fgX, fgY + fgH, fgX, fgY + fgH - radius);
    ctx.lineTo(fgX, fgY + radius);
    ctx.quadraticCurveTo(fgX, fgY, fgX + radius, fgY);
    ctx.closePath();
    
    ctx.fillStyle = '#000000'; 
    ctx.fill();
    
    ctx.shadowColor = 'transparent'; 
    ctx.clip();
    ctx.drawImage(processedCanvas, fgX, fgY, fgW, fgH);
    ctx.restore();

    if (hasOffscreenCanvas && outputCanvas instanceof OffscreenCanvas) {
         return await outputCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
    } else if (outputCanvas instanceof HTMLCanvasElement) {
         return new Promise(resolve => outputCanvas.toBlob(resolve, 'image/jpeg', 0.95));
    }
    return null;
};

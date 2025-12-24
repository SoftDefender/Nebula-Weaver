
import { FrameConfig, ImageEditConfig, RenderRequest } from '../types';

// Helper to check for OffscreenCanvas support
const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

// Safe limit for mobile/desktop browser compatibility (8K resolution)
// Exceeding this often causes OOM crashes or silent failures on mobile devices (iOS limit ~16MP total area)
const MAX_DIM = 8192; 

/**
 * Calculates dimensions that fit within safe limits while preserving aspect ratio
 */
const calculateSafeDimensions = (w: number, h: number): { w: number, h: number, scale: number } => {
    if (w <= MAX_DIM && h <= MAX_DIM) {
        return { w, h, scale: 1.0 };
    }
    const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
    return {
        w: Math.floor(w * scale),
        h: Math.floor(h * scale),
        scale
    };
};

/**
 * Creates a canvas (Offscreen or DOM)
 */
const createCanvas = (w: number, h: number): OffscreenCanvas | HTMLCanvasElement => {
    // Try to create canvas. If OOM occurs, this constructor might throw.
    if (hasOffscreenCanvas) {
        try {
            return new OffscreenCanvas(w, h);
        } catch (e) {
            console.warn("OffscreenCanvas failed, falling back to element", e);
        }
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

    const rawW = isVertical ? naturalHeight : naturalWidth;
    const rawH = isVertical ? naturalWidth : naturalHeight;

    // Apply safe scaling for intermediate canvas
    const { w, h } = calculateSafeDimensions(rawW, rawH);
    
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    
    if (!ctx) {
        throw new Error("Failed to get context for processed image");
    }

    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate((editConfig.rotation * Math.PI) / 180);
    ctx.scale(editConfig.flipH ? -1 : 1, editConfig.flipV ? -1 : 1);
    
    // Draw with scaling if needed
    // We draw the source into the (potentially smaller) destination
    // Destination center is 0,0 due to translate
    // We need to map source dimensions to destination dimensions
    
    // Calculate aspect-correct draw dimensions
    const drawW = isVertical ? h : w;
    const drawH = isVertical ? w : h;
    
    ctx.drawImage(img, -drawW/2, -drawH/2, drawW, drawH);
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
           
           // Cleanup intermediate
           try { canvas.width = 0; canvas.height = 0; } catch(e) {}
           return croppedCanvas;
        }
    }
    return canvas;
};

export const renderFrame = async (req: RenderRequest): Promise<Blob | null> => {
    const { imageBitmap, frameConfig, editConfig, quality } = req;
    
    let processedCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
    let outputCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;

    try {
        processedCanvas = getProcessedImage(imageBitmap, editConfig);
        const finalW = processedCanvas.width;
        const finalH = processedCanvas.height;
        
        // Determine Output Size Logic
        let reqCw = finalW;
        let reqCh = finalH;

        if (frameConfig.aspectRatio === 'custom') {
            if (frameConfig.customWidth && frameConfig.customHeight) {
                const targetW = frameConfig.customWidth;
                const targetH = frameConfig.customHeight;
                const targetRatio = targetW / targetH;
                const imgRatio = finalW / finalH;
                
                if (imgRatio > targetRatio) {
                    reqCw = finalW;
                    reqCh = reqCw / targetRatio;
                } else {
                    reqCh = finalH;
                    reqCw = reqCh * targetRatio;
                }
            }
        } else if (frameConfig.aspectRatio !== 'original') {
            const [rw, rh] = frameConfig.aspectRatio.split(':').map(Number);
            const targetRatio = rw / rh;
            const imgRatio = finalW / finalH;

            if (imgRatio > targetRatio) {
                reqCw = finalW;
                reqCh = reqCw / targetRatio;
            } else {
                reqCh = finalH;
                reqCw = reqCh * targetRatio;
            }
        }

        // Apply Safe Limits to Output
        const { w: cw, h: ch, scale: outputScale } = calculateSafeDimensions(reqCw, reqCh);

        // Preview Resolution Override
        let scaleFactor = 1.0;
        let finalCw = cw;
        let finalCh = ch;

        if (quality === 'preview') {
            const MAX_PREVIEW = 1200; 
            if (finalCw > MAX_PREVIEW || finalCh > MAX_PREVIEW) {
                scaleFactor = Math.min(MAX_PREVIEW/finalCw, MAX_PREVIEW/finalCh);
                finalCw *= scaleFactor;
                finalCh *= scaleFactor;
            }
        }

        outputCanvas = createCanvas(finalCw, finalCh);
        const ctx = outputCanvas.getContext('2d') as CanvasRenderingContext2D;
        if (!ctx) throw new Error("Context creation failed");

        // --- Draw Logic ---
        
        // Background
        ctx.save();
        const imgRatio = finalW / finalH;
        const canvasRatio = finalCw / finalCh;
        
        let bgW, bgH, bgX, bgY;
        if (canvasRatio > imgRatio) {
            bgW = finalCw;
            bgH = finalCw / imgRatio;
            bgX = 0;
            bgY = (finalCh - bgH) / 2;
        } else {
            bgH = finalCh;
            bgW = finalCh * imgRatio;
            bgY = 0;
            bgX = (finalCw - bgW) / 2;
        }
        
        const refSize = 1000 * (quality === 'preview' ? scaleFactor : outputScale);
        const resScale = Math.max(finalCw, finalCh) / refSize;
        
        // Blur Effect
        ctx.filter = `blur(${frameConfig.blurIntensity * resScale}px) saturate(160%) brightness(1.1)`;
        ctx.drawImage(processedCanvas, bgX - (bgW*0.05), bgY - (bgH*0.05), bgW * 1.1, bgH * 1.1);
        ctx.filter = 'none';

        // Overlay
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(0, 0, finalCw, finalCh);
        ctx.restore();

        // Shadow Base
        ctx.fillStyle = frameConfig.shadowColor === 'black' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
        ctx.fillRect(0,0,finalCw,finalCh);

        // Foreground
        const marginScale = frameConfig.scale; 
        let fgW, fgH;
        if (canvasRatio > imgRatio) {
            fgH = finalCh * marginScale;
            fgW = fgH * imgRatio;
        } else {
            fgW = finalCw * marginScale;
            fgH = fgW / imgRatio;
        }
        const fgX = (finalCw - fgW) / 2;
        const fgY = (finalCh - fgH) / 2;

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
        
        // Clean intermediate processed canvas
        try { processedCanvas.width = 0; processedCanvas.height = 0; } catch (e) {}
        processedCanvas = null;

        if (hasOffscreenCanvas && outputCanvas instanceof OffscreenCanvas) {
            const blob = await outputCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
            try { outputCanvas.width = 0; outputCanvas.height = 0; } catch (e) {}
            return blob;
        } else if (outputCanvas instanceof HTMLCanvasElement) {
            return new Promise(resolve => {
                (outputCanvas as HTMLCanvasElement).toBlob((b) => {
                    try { if (outputCanvas) { outputCanvas.width = 0; outputCanvas.height = 0; } } catch(e){}
                    resolve(b);
                }, 'image/jpeg', 0.95);
            });
        }
        return null;

    } catch (error) {
        console.error("Render worker error:", error);
        // Attempt cleanup
        if (processedCanvas) { try { processedCanvas.width = 0; } catch(e){} }
        if (outputCanvas) { try { outputCanvas.width = 0; } catch(e){} }
        throw error;
    }
};

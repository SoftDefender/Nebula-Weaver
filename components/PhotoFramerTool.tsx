import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FrameConfig, FrameAspectRatio, FramedImage } from '../types';
import { 
  PhotoIcon, 
  ArrowDownTrayIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  TrashIcon,
  HomeIcon,
  SparklesIcon
} from '@heroicons/react/24/solid';

interface PhotoFramerToolProps {
  onBack: () => void;
}

const PhotoFramerTool: React.FC<PhotoFramerToolProps> = ({ onBack }) => {
  const [images, setImages] = useState<FramedImage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  
  // Configuration State
  const [config, setConfig] = useState<FrameConfig>({
    aspectRatio: 'original',
    scale: 0.85, // Default margin
    shadowColor: 'black',
    shadowIntensity: 40,
    blurIntensity: 40,
    borderRadius: 20
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Handle Upload
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newImages: FramedImage[] = Array.from(e.target.files).map((file: File) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
        width: 0, 
        height: 0
      }));
      
      // Load dimensions for high quality render
      newImages.forEach(img => {
        const i = new Image();
        i.src = img.previewUrl;
        i.onload = () => {
           img.width = i.naturalWidth;
           img.height = i.naturalHeight;
           // Trigger re-render to ensure dimensions are caught
           setImages(prev => [...prev]);
        };
      });

      setImages(prev => [...prev, ...newImages]);
    }
  };

  const removeImage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newImages = [...images];
    URL.revokeObjectURL(newImages[index].previewUrl);
    newImages.splice(index, 1);
    setImages(newImages);
    if (activeIndex >= newImages.length) setActiveIndex(Math.max(0, newImages.length - 1));
  };

  // The Rendering Engine
  const drawCanvas = useCallback((ctx: CanvasRenderingContext2D, imgObj: FramedImage, renderConfig: FrameConfig) => {
    const img = new Image();
    img.src = imgObj.previewUrl;
    
    // We need synchronous drawing for export, but for preview we rely on browser cache usually loading fast.
    // However, ensure image is loaded before drawing.
    if (!img.complete) return;

    const naturalW = imgObj.width || img.naturalWidth;
    const naturalH = imgObj.height || img.naturalHeight;
    
    if (naturalW === 0 || naturalH === 0) return;

    // 1. Determine Canvas Size
    let cw = naturalW;
    let ch = naturalH;

    if (renderConfig.aspectRatio === 'custom') {
       if (renderConfig.customWidth && renderConfig.customHeight) {
          // If user provides specific pixels (not just ratio)
          // We ideally want to maintain the image's quality.
          // Let's treat custom W/H as a ratio target, but scale up to match image resolution.
          const targetW = renderConfig.customWidth;
          const targetH = renderConfig.customHeight;
          const targetRatio = targetW / targetH;
          const imgRatio = naturalW / naturalH;
          
          if (imgRatio > targetRatio) {
             cw = naturalW;
             ch = cw / targetRatio;
          } else {
             ch = naturalH;
             cw = ch * targetRatio;
          }
       }
    } else if (renderConfig.aspectRatio !== 'original') {
        const [rw, rh] = renderConfig.aspectRatio.split(':').map(Number);
        const targetRatio = rw / rh;
        const imgRatio = naturalW / naturalH;

        if (imgRatio > targetRatio) {
           cw = naturalW;
           ch = cw / targetRatio;
        } else {
           ch = naturalH;
           cw = ch * targetRatio;
        }
    }

    ctx.canvas.width = cw;
    ctx.canvas.height = ch;

    // 2. Draw Background (Cover + Frost)
    ctx.save();
    
    // Fill Background Logic
    const canvasRatio = cw / ch;
    const imgRatio = naturalW / naturalH;
    
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
    
    const refSize = 1000;
    const resScale = Math.max(cw, ch) / refSize;
    
    // Frosted Glass Effect: Blur + Saturation
    ctx.filter = `blur(${renderConfig.blurIntensity * resScale}px) saturate(160%) brightness(1.1)`;
    // Scale slightly to hide blur edges
    ctx.drawImage(img, bgX - (bgW*0.05), bgY - (bgH*0.05), bgW * 1.1, bgH * 1.1);
    ctx.filter = 'none';

    // White Overlay for that "Milky Glass" feel
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();

    // 3. Draw Overlay/Shadow Base
    ctx.fillStyle = renderConfig.shadowColor === 'black' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
    ctx.fillRect(0,0,cw,ch);

    // 4. Draw Foreground (Scaled, Shadow, Radius)
    const marginScale = renderConfig.scale; 
    
    // Fit Logic (Contain)
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

    // Shadow
    ctx.save();
    // Tight Shadow: Close offset, high opacity, small blur
    const shadowOpacity = renderConfig.shadowColor === 'black' ? 0.5 : 0.8;
    ctx.shadowColor = renderConfig.shadowColor === 'black' 
        ? `rgba(0,0,0,${shadowOpacity})` 
        : `rgba(255,255,255,${shadowOpacity})`;
    
    // Use smaller multiplier for tighter shadow
    ctx.shadowBlur = renderConfig.shadowIntensity * 0.5 * resScale; 
    ctx.shadowOffsetY = renderConfig.shadowIntensity * 0.15 * resScale;
    ctx.shadowOffsetX = 0;
    
    // Rounded Clip Path
    const radius = (Math.min(fgW, fgH) * (renderConfig.borderRadius / 100)) / 2;
    
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
    
    // Fill to cast shadow
    ctx.fillStyle = '#000000'; 
    ctx.fill();
    
    // Clip and Draw Image
    ctx.shadowColor = 'transparent'; 
    ctx.clip();
    ctx.drawImage(img, fgX, fgY, fgW, fgH);
    ctx.restore();

  }, []);

  // Live Preview Effect
  useEffect(() => {
    if (images.length === 0 || !canvasRef.current) return;
    const activeImg = images[activeIndex];
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
       const img = new Image();
       img.src = activeImg.previewUrl;
       img.onload = () => {
           drawCanvas(ctx, activeImg, config);
       };
    }
  }, [images, activeIndex, config, drawCanvas]);

  const handleExportAll = async () => {
     if (images.length === 0) return;
     setIsExporting(true);
     
     for (let i = 0; i < images.length; i++) {
        const imgObj = images[i];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        
        if (imgObj.width === 0) {
           await new Promise<void>((resolve) => {
               const tmp = new Image();
               tmp.src = imgObj.previewUrl;
               tmp.onload = () => {
                   imgObj.width = tmp.naturalWidth;
                   imgObj.height = tmp.naturalHeight;
                   resolve();
               }
           });
        }
        
        drawCanvas(ctx, imgObj, config);
        
        await new Promise<void>((resolve) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    const originalName = imgObj.file.name.replace(/\.[^/.]+$/, "");
                    link.download = `${originalName}_framed.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }
                resolve();
            }, 'image/jpeg', 0.95);
        });
     }
     
     setIsExporting(false);
  };

  return (
    <div className="min-h-screen font-sans bg-sc-gray pb-20">
      
      {/* Header */}
      <header className="bg-sc-dark w-full sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto h-14 px-4 flex items-center justify-between">
            <div className="flex items-center gap-6">
                <div onClick={onBack} className="cursor-pointer flex items-center gap-2 group">
                    <div className="bg-sc-primary w-8 h-8 flex items-center justify-center rounded-[3px] group-hover:bg-sc-primaryHover transition-colors">
                        <PhotoIcon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-white font-bold text-lg tracking-tight">PHOTO<span className="font-normal opacity-80">FRAMER</span></span>
                </div>
            </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Sources */}
        <section className="lg:col-span-3 space-y-4">
            <div className="bg-sc-card border border-sc-border rounded-sm p-5 shadow-sc">
                <h2 className="text-xs font-bold uppercase text-sc-subtext mb-4 border-b border-sc-border pb-2">Photos</h2>
                
                <input 
                  type="file" 
                  id="photo-upload"
                  multiple
                  accept="image/*"
                  onChange={handleUpload}
                  className="hidden"
                />
                <label 
                  htmlFor="photo-upload"
                  className="block w-full py-2 px-4 text-sm font-bold text-center border rounded-[3px] cursor-pointer bg-sc-primary text-white hover:bg-sc-primaryHover transition-colors"
                >
                  Upload Photos
                </label>

                {images.length > 0 && (
                    <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-2">
                        {images.map((img, idx) => (
                            <div 
                                key={img.id}
                                onClick={() => setActiveIndex(idx)}
                                className={`flex items-center gap-3 p-2 rounded-[3px] cursor-pointer border ${idx === activeIndex ? 'bg-blue-50 border-sc-primary' : 'bg-white border-transparent hover:bg-gray-50'}`}
                            >
                                <img src={img.previewUrl} className="w-10 h-10 object-cover rounded-[2px] bg-gray-200" alt="" />
                                <div className="flex-1 min-w-0">
                                    <div className={`text-xs truncate ${idx === activeIndex ? 'font-bold text-sc-primary' : 'text-sc-text'}`}>{img.file.name}</div>
                                    <div className="text-[10px] text-sc-subtext">{img.width > 0 ? `${img.width}x${img.height}` : 'Loading...'}</div>
                                </div>
                                <button onClick={(e) => removeImage(idx, e)} className="text-gray-300 hover:text-red-500">
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>

        {/* Center: Canvas Preview */}
        <section className="lg:col-span-6">
             <div className="bg-sc-card border border-sc-border rounded-[3px] shadow-sc overflow-hidden relative">
                 <div className="bg-[#e5e5e5] aspect-square flex items-center justify-center relative overflow-hidden">
                     {images.length > 0 ? (
                        <canvas 
                            ref={canvasRef}
                            className="max-w-full max-h-full object-contain shadow-lg"
                        />
                     ) : (
                        <div className="text-sc-subtext text-sm font-medium">Upload photos to begin</div>
                     )}
                 </div>

                 {/* Navigation Overlay */}
                 {images.length > 1 && (
                     <>
                        <button 
                            onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))} 
                            disabled={activeIndex === 0}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white hover:bg-sc-primary rounded-[2px] disabled:opacity-0"
                        >
                            <ChevronLeftIcon className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={() => setActiveIndex(Math.min(images.length - 1, activeIndex + 1))}
                            disabled={activeIndex === images.length - 1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white hover:bg-sc-primary rounded-[2px] disabled:opacity-0"
                        >
                            <ChevronRightIcon className="w-6 h-6" />
                        </button>
                     </>
                 )}

                 <div className="p-4 bg-white border-t border-sc-border">
                     <button 
                        onClick={handleExportAll}
                        disabled={images.length === 0 || isExporting}
                        className="w-full py-3 bg-sc-dark text-white font-bold text-sm rounded-[3px] hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                     >
                        {isExporting ? <ArrowDownTrayIcon className="w-4 h-4 animate-bounce" /> : <ArrowDownTrayIcon className="w-4 h-4" />}
                        {isExporting ? 'Processing...' : `Download All (${images.length})`}
                     </button>
                 </div>
             </div>
        </section>

        {/* Right: Settings */}
        <section className="lg:col-span-3 space-y-4">
            <div className="bg-sc-card border border-sc-border rounded-[3px] p-5 shadow-sc">
                <h2 className="text-xs font-bold uppercase text-sc-subtext mb-5 border-b border-sc-border pb-2">Frame Settings</h2>
                
                <div className="space-y-6">
                    {/* Ratio */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-sc-text block">Canvas Ratio</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['original', '1:1', '4:3', '3:4', '16:9', '9:16', '1:2', '2:1', 'custom'].map(r => (
                                <button
                                    key={r}
                                    onClick={() => setConfig({...config, aspectRatio: r as FrameAspectRatio})}
                                    className={`text-[10px] font-bold py-1.5 border rounded-[2px] ${config.aspectRatio === r ? 'bg-sc-primary text-white border-sc-primary' : 'bg-white border-sc-border text-sc-text hover:border-sc-primary'}`}
                                >
                                    {r.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        {config.aspectRatio === 'custom' && (
                           <div className="grid grid-cols-2 gap-2 mt-2">
                               <div>
                                  <label className="text-[10px] text-sc-subtext">Width</label>
                                  <input 
                                     type="number" 
                                     value={config.customWidth || 1080}
                                     onChange={(e) => setConfig({...config, customWidth: parseInt(e.target.value)})}
                                     className="w-full text-xs border border-sc-border p-1 rounded-[2px] mt-1 focus:border-sc-primary outline-none"
                                  />
                               </div>
                               <div>
                                  <label className="text-[10px] text-sc-subtext">Height</label>
                                  <input 
                                     type="number" 
                                     value={config.customHeight || 1920}
                                     onChange={(e) => setConfig({...config, customHeight: parseInt(e.target.value)})}
                                     className="w-full text-xs border border-sc-border p-1 rounded-[2px] mt-1 focus:border-sc-primary outline-none"
                                  />
                               </div>
                           </div>
                        )}
                    </div>

                    <div className="h-px bg-sc-border"></div>

                    {/* Scale */}
                    <div>
                        <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Image Scale</span><span>{Math.round(config.scale * 100)}%</span></div>
                        <input type="range" min="0.1" max="1.0" step="0.01" value={config.scale} onChange={(e) => setConfig({...config, scale: parseFloat(e.target.value)})} />
                    </div>

                    {/* Blur */}
                    <div>
                        <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Frosted Blur</span><span>{config.blurIntensity}</span></div>
                        <input type="range" min="0" max="30" step="1" value={config.blurIntensity} onChange={(e) => setConfig({...config, blurIntensity: parseFloat(e.target.value)})} />
                    </div>

                    {/* Radius */}
                    <div>
                        <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Corner Radius</span><span>{config.borderRadius}</span></div>
                        <input type="range" min="0" max="50" step="1" value={config.borderRadius} onChange={(e) => setConfig({...config, borderRadius: parseFloat(e.target.value)})} />
                    </div>

                    {/* Shadow */}
                    <div className="space-y-3">
                         <div className="flex items-center justify-between">
                             <span className="text-[11px] font-bold text-sc-text">Shadow</span>
                             <div className="flex gap-1 bg-gray-100 p-1 rounded-[3px]">
                                 <button onClick={() => setConfig({...config, shadowColor: 'black'})} className={`w-4 h-4 rounded-[2px] border ${config.shadowColor === 'black' ? 'bg-black border-sc-primary scale-110' : 'bg-black border-transparent opacity-50'}`}></button>
                                 <button onClick={() => setConfig({...config, shadowColor: 'white'})} className={`w-4 h-4 rounded-[2px] border ${config.shadowColor === 'white' ? 'bg-white border-sc-primary scale-110' : 'bg-white border-gray-300 opacity-50'}`}></button>
                             </div>
                         </div>
                         <div>
                            <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Intensity</span><span>{config.shadowIntensity}</span></div>
                            <input type="range" min="0" max="100" step="1" value={config.shadowIntensity} onChange={(e) => setConfig({...config, shadowIntensity: parseFloat(e.target.value)})} />
                         </div>
                    </div>

                </div>
            </div>
        </section>

      </main>
    </div>
  );
};

export default PhotoFramerTool;

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FrameConfig, FrameAspectRatio, FramedImage, ImageEditConfig, RenderRequest } from '../types';
import { renderFrame } from '../services/framerWorker'; // Now acts as a service
import JSZip from 'jszip';
import { 
  PhotoIcon, 
  ArrowDownTrayIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  TrashIcon,
  AdjustmentsHorizontalIcon,
  ArrowsRightLeftIcon,
  ArrowPathIcon,
  XCircleIcon,
  Square2StackIcon
} from '@heroicons/react/24/solid';

interface PhotoFramerToolProps {
  onBack: () => void;
}

const PhotoFramerTool: React.FC<PhotoFramerToolProps> = ({ onBack }) => {
  const [images, setImages] = useState<FramedImage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  
  // Progress State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [shouldZip, setShouldZip] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [settingsTab, setSettingsTab] = useState<'frame' | 'image'>('frame');
  
  // Configuration
  const [config, setConfig] = useState<FrameConfig>({
    aspectRatio: 'original',
    scale: 0.85,
    shadowColor: 'black',
    shadowIntensity: 40,
    blurIntensity: 20,
    borderRadius: 7
  });
  
  const [debouncedConfig, setDebouncedConfig] = useState(config);

  // Debounce Config
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedConfig(config), 150);
    return () => clearTimeout(handler);
  }, [config]);

  // Initial Edit State
  const defaultEditConfig: ImageEditConfig = {
    rotation: 0,
    flipH: false,
    flipV: false,
    zoom: 1.0,
    panX: 0,
    panY: 0
  };

  // Preview Logic (Canvas)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewBlobUrlRef = useRef<string | null>(null);

  // Generate Preview via Async Service
  useEffect(() => {
      if (images.length === 0) return;
      const activeImg = images[activeIndex];
      let isActive = true;
      
      const updatePreview = async () => {
          // Use Image object for standard service
          const img = new Image();
          img.src = activeImg.previewUrl;
          await new Promise((r) => { img.onload = r; });

          if (!isActive) return;

          const req: RenderRequest = {
              id: `preview-${Date.now()}`,
              imageBitmap: img, 
              frameConfig: debouncedConfig,
              editConfig: activeImg.editConfig,
              quality: 'preview' // Low res for fast UI
          };

          try {
              const blob = await renderFrame(req);
              if (blob && isActive) {
                  if (previewBlobUrlRef.current) URL.revokeObjectURL(previewBlobUrlRef.current);
                  const url = URL.createObjectURL(blob);
                  previewBlobUrlRef.current = url;
                  
                  // Draw to visible canvas
                  const canvas = canvasRef.current;
                  const ctx = canvas?.getContext('2d');
                  const pImg = new Image();
                  pImg.onload = () => {
                      if (canvas && ctx && isActive) {
                          canvas.width = pImg.width;
                          canvas.height = pImg.height;
                          ctx.drawImage(pImg, 0, 0);
                      }
                  };
                  pImg.src = url;
              }
          } catch (e) {
              console.error("Preview render failed", e);
          }
      };
      
      updatePreview();
      return () => { isActive = false; };
  }, [activeIndex, debouncedConfig, images]); // Deep compare handled by useEffect logic generally

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newImages: FramedImage[] = Array.from(e.target.files).map((file: File) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
        width: 0, 
        height: 0,
        editConfig: { ...defaultEditConfig },
        status: 'pending'
      }));
      
      // Load dimensions asynchronously without blocking
      newImages.forEach(img => {
        const i = new Image();
        i.src = img.previewUrl;
        i.onload = () => {
           setImages(prev => prev.map(p => p.id === img.id ? { ...p, width: i.naturalWidth, height: i.naturalHeight } : p));
        };
      });

      setImages(prev => [...prev, ...newImages]);
    }
    // Reset input
    e.target.value = '';
  };

  const removeImage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newImages = [...images];
    URL.revokeObjectURL(newImages[index].previewUrl);
    newImages.splice(index, 1);
    setImages(newImages);
    if (activeIndex >= newImages.length) setActiveIndex(Math.max(0, newImages.length - 1));
  };

  const updateActiveImageEdit = (updates: Partial<ImageEditConfig>) => {
      setImages(prev => {
          const copy = [...prev];
          if (copy[activeIndex]) {
              copy[activeIndex] = {
                  ...copy[activeIndex],
                  editConfig: { ...copy[activeIndex].editConfig, ...updates }
              };
          }
          return copy;
      });
  };

  // --- Export Logic ---
  
  const handleExport = async () => {
      if (images.length === 0 || isExporting) return;
      
      setIsExporting(true);
      setExportProgress({ current: 0, total: images.length });
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      
      const zip = shouldZip ? new JSZip() : null;
      
      try {
          for (let i = 0; i < images.length; i++) {
              if (signal.aborted) throw new Error("Cancelled");
              
              const imgObj = images[i];
              
              // 1. Get Image
              const img = new Image();
              img.src = imgObj.previewUrl;
              await new Promise((r) => { img.onload = r; });
              
              // 2. Request Service Render
              // Yield to main thread briefly to allow UI update
              await new Promise(r => setTimeout(r, 0));

              const req: RenderRequest = {
                  id: `export-${imgObj.id}`,
                  imageBitmap: img,
                  frameConfig: config,
                  editConfig: imgObj.editConfig,
                  quality: 'full'
              };
              
              const blob = await renderFrame(req);

              if (blob) {
                  const originalName = imgObj.file.name.replace(/\.[^/.]+$/, "");
                  const fileName = `${originalName}_framed.jpg`;

                  if (zip) {
                      zip.file(fileName, blob);
                  } else {
                      // Direct Download
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = fileName;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                      // Slight delay to prevent browser choking on multiple downloads
                      await new Promise(r => setTimeout(r, 200));
                  }
              }
              
              setExportProgress({ current: i + 1, total: images.length });
          }
          
          if (zip && !signal.aborted) {
              const content = await zip.generateAsync({ type: "blob" });
              const url = URL.createObjectURL(content);
              const link = document.createElement('a');
              link.href = url;
              link.download = `framed_photos_batch_${Date.now()}.zip`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
          }

      } catch (err: any) {
          if (err.message !== "Cancelled") {
              console.error("Export failed:", err);
              alert("Export encountered an error. Check console.");
          }
      } finally {
          setIsExporting(false);
          abortControllerRef.current = null;
      }
  };

  const handleCancel = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
      }
  };
  
  const currentEdit = images[activeIndex]?.editConfig || defaultEditConfig;

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
            <div className="bg-sc-card border border-sc-border rounded-sm p-5 shadow-sc flex flex-col h-[80vh] lg:h-auto">
                <h2 className="text-xs font-bold uppercase text-sc-subtext mb-4 border-b border-sc-border pb-2">Photos ({images.length})</h2>
                
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
                  className={`block w-full py-2 px-4 text-sm font-bold text-center border rounded-[3px] cursor-pointer transition-colors mb-4 ${isExporting ? 'bg-gray-300 cursor-not-allowed text-gray-500' : 'bg-sc-primary text-white hover:bg-sc-primaryHover'}`}
                >
                  {isExporting ? 'Processing...' : 'Upload Photos'}
                </label>

                {/* Photo List - Standard Scroll */}
                <div className="flex-1 lg:flex-none lg:max-h-[600px] overflow-y-auto relative pr-1 custom-scrollbar" style={{ minHeight: '300px' }}>
                     {images.length > 0 ? (
                         <div className="flex flex-col gap-1">
                             {images.map((img, idx) => (
                                <div 
                                    key={img.id}
                                    onClick={() => !isExporting && setActiveIndex(idx)}
                                    className={`w-full flex items-center gap-3 p-2 rounded-[3px] cursor-pointer border transition-colors ${idx === activeIndex ? 'bg-blue-50 border-sc-primary' : 'bg-white border-transparent hover:bg-gray-50'}`}
                                >
                                    <img src={img.previewUrl} className="w-10 h-10 object-cover rounded-[2px] bg-gray-200" alt="" />
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-xs truncate ${idx === activeIndex ? 'font-bold text-sc-primary' : 'text-sc-text'}`}>{img.file.name}</div>
                                        <div className="text-[10px] text-sc-subtext">{img.width > 0 ? `${img.width}x${img.height}` : 'Loading...'}</div>
                                    </div>
                                    <button onClick={(e) => !isExporting && removeImage(idx, e)} className="text-gray-300 hover:text-red-500 disabled:opacity-0" disabled={isExporting}>
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                             ))}
                         </div>
                     ) : (
                        <div className="flex items-center justify-center h-full text-sc-subtext text-xs italic">
                            No photos added
                        </div>
                     )}
                </div>
            </div>
        </section>

        {/* Center: Canvas Preview */}
        <section className="lg:col-span-6">
             <div className="bg-sc-card border border-sc-border rounded-[3px] shadow-sc overflow-hidden relative">
                 <div className="bg-[#e5e5e5] aspect-square flex items-center justify-center relative overflow-hidden">
                     {images.length > 0 ? (
                        <canvas 
                            ref={canvasRef}
                            className="max-w-full max-h-full object-contain shadow-lg transition-opacity duration-300"
                        />
                     ) : (
                        <div className="text-sc-subtext text-sm font-medium">Upload photos to begin</div>
                     )}
                     
                     {/* Export Progress Overlay */}
                     {isExporting && (
                         <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 text-white animate-fade-in">
                             <ArrowPathIcon className="w-10 h-10 animate-spin mb-4 text-sc-primary" />
                             <div className="text-xl font-bold mb-2">Processing...</div>
                             <div className="text-sm font-mono mb-6">{exportProgress.current} / {exportProgress.total}</div>
                             <div className="w-64 h-2 bg-gray-700 rounded-full mb-6 overflow-hidden">
                                 <div 
                                    className="h-full bg-sc-primary transition-all duration-300 ease-out"
                                    style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                                 ></div>
                             </div>
                             <button 
                                onClick={handleCancel}
                                className="px-6 py-2 border border-red-500 text-red-400 hover:bg-red-500/10 rounded-[3px] text-xs font-bold flex items-center gap-2 transition-colors"
                             >
                                <XCircleIcon className="w-4 h-4" /> Cancel
                             </button>
                         </div>
                     )}
                 </div>

                 {/* Navigation Overlay */}
                 {images.length > 1 && !isExporting && (
                     <>
                        <button 
                            onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))} 
                            disabled={activeIndex === 0}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white hover:bg-sc-primary rounded-[2px] disabled:opacity-0 transition-all"
                        >
                            <ChevronLeftIcon className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={() => setActiveIndex(Math.min(images.length - 1, activeIndex + 1))}
                            disabled={activeIndex === images.length - 1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white hover:bg-sc-primary rounded-[2px] disabled:opacity-0 transition-all"
                        >
                            <ChevronRightIcon className="w-6 h-6" />
                        </button>
                     </>
                 )}

                 <div className="p-4 bg-white border-t border-sc-border flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer group">
                             <div className={`w-4 h-4 border rounded-[2px] flex items-center justify-center transition-colors ${shouldZip ? 'bg-sc-primary border-sc-primary' : 'border-gray-300 bg-white'}`}>
                                 {shouldZip && <div className="w-2 h-2 bg-white rounded-[1px]"></div>}
                             </div>
                             <input type="checkbox" checked={shouldZip} onChange={() => setShouldZip(!shouldZip)} className="hidden" />
                             <span className="text-xs font-bold text-sc-text group-hover:text-sc-primary">Export as ZIP Archive</span>
                        </label>
                        <span className="text-[10px] text-sc-subtext">Quality: 100% (Match Source)</span>
                     </div>
                     
                     <button 
                        onClick={handleExport}
                        disabled={images.length === 0 || isExporting}
                        className={`w-full py-3 font-bold text-sm rounded-[3px] flex items-center justify-center gap-2 transition-all ${isExporting ? 'bg-gray-100 text-gray-400' : 'bg-sc-dark text-white hover:bg-gray-800 shadow-md'}`}
                     >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        {isExporting ? 'Exporting...' : `Download All (${images.length})`}
                     </button>
                 </div>
             </div>
        </section>

        {/* Right: Settings */}
        <section className="lg:col-span-3 space-y-4">
            <div className="bg-sc-card border border-sc-border rounded-[3px] p-5 shadow-sc">
                
                {/* Tabs */}
                <div className="flex border-b border-sc-border mb-5">
                    <button 
                        onClick={() => setSettingsTab('frame')}
                        className={`flex-1 pb-2 text-xs font-bold uppercase transition-colors ${settingsTab === 'frame' ? 'text-sc-primary border-b-2 border-sc-primary' : 'text-sc-subtext hover:text-sc-text'}`}
                        disabled={isExporting}
                    >
                        Frame
                    </button>
                    <button 
                        onClick={() => setSettingsTab('image')}
                        className={`flex-1 pb-2 text-xs font-bold uppercase transition-colors ${settingsTab === 'image' ? 'text-sc-primary border-b-2 border-sc-primary' : 'text-sc-subtext hover:text-sc-text'}`}
                        disabled={images.length === 0 || isExporting}
                    >
                        Image Edit
                    </button>
                </div>
                
                {settingsTab === 'frame' ? (
                <div className={`space-y-6 animate-fade-in ${isExporting ? 'opacity-50 pointer-events-none' : ''}`}>
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
                        <input type="range" min="0" max="100" step="1" value={config.blurIntensity} onChange={(e) => setConfig({...config, blurIntensity: parseFloat(e.target.value)})} />
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
                ) : (
                <div className={`space-y-6 animate-fade-in ${isExporting ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="text-[10px] text-sc-subtext bg-blue-50 text-sc-primary p-2 rounded-[3px] border border-blue-100">
                        Edits apply only to the selected image.
                    </div>
                    
                    {/* Rotate & Flip */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-bold text-sc-text block">Transform</label>
                        <div className="grid grid-cols-2 gap-2">
                             <button 
                                onClick={() => updateActiveImageEdit({ rotation: (currentEdit.rotation + 90) % 360 })}
                                className="flex items-center justify-center gap-2 py-2 bg-white border border-sc-border hover:border-sc-primary text-xs font-medium rounded-[3px]"
                             >
                                <ArrowPathIcon className="w-3 h-3" /> Rotate 90°
                             </button>
                             <div className="flex gap-2">
                                <button 
                                    onClick={() => updateActiveImageEdit({ flipH: !currentEdit.flipH })}
                                    className={`flex-1 flex items-center justify-center border rounded-[3px] ${currentEdit.flipH ? 'bg-sc-primary text-white border-sc-primary' : 'bg-white border-sc-border text-sc-text hover:border-sc-primary'}`}
                                    title="Flip Horizontal"
                                >
                                    <ArrowsRightLeftIcon className="w-3 h-3" />
                                </button>
                                <button 
                                    onClick={() => updateActiveImageEdit({ flipV: !currentEdit.flipV })}
                                    className={`flex-1 flex items-center justify-center border rounded-[3px] ${currentEdit.flipV ? 'bg-sc-primary text-white border-sc-primary' : 'bg-white border-sc-border text-sc-text hover:border-sc-primary'}`}
                                    title="Flip Vertical"
                                >
                                    <ArrowsRightLeftIcon className="w-3 h-3 rotate-90" />
                                </button>
                             </div>
                        </div>
                    </div>
                    
                    <div className="h-px bg-sc-border"></div>
                    
                    {/* Crop / Zoom */}
                    <div className="space-y-4">
                        <label className="text-[11px] font-bold text-sc-text block">Crop & Pan</label>
                        
                        <div>
                            <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Zoom</span><span>{currentEdit.zoom.toFixed(2)}x</span></div>
                            <input 
                                type="range" min="1.0" max="3.0" step="0.05" 
                                value={currentEdit.zoom} 
                                onChange={(e) => updateActiveImageEdit({ zoom: parseFloat(e.target.value) })} 
                            />
                        </div>

                        <div>
                            <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Pan X</span><span>{currentEdit.panX.toFixed(0)}</span></div>
                            <input 
                                type="range" min="-100" max="100" step="1" 
                                value={currentEdit.panX} 
                                onChange={(e) => updateActiveImageEdit({ panX: parseFloat(e.target.value) })} 
                                disabled={currentEdit.zoom === 1}
                                className={currentEdit.zoom === 1 ? 'opacity-50 cursor-not-allowed' : ''}
                            />
                        </div>

                        <div>
                            <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Pan Y</span><span>{currentEdit.panY.toFixed(0)}</span></div>
                            <input 
                                type="range" min="-100" max="100" step="1" 
                                value={currentEdit.panY} 
                                onChange={(e) => updateActiveImageEdit({ panY: parseFloat(e.target.value) })} 
                                disabled={currentEdit.zoom === 1}
                                className={currentEdit.zoom === 1 ? 'opacity-50 cursor-not-allowed' : ''}
                            />
                        </div>
                        
                        <button 
                             onClick={() => updateActiveImageEdit(defaultEditConfig)}
                             className="w-full py-1 text-[10px] text-sc-subtext hover:text-sc-primary border border-transparent hover:border-sc-border rounded-[2px]"
                        >
                            Reset Image
                        </button>
                    </div>
                </div>
                )}
            </div>
        </section>

      </main>
    </div>
  );
};

export default PhotoFramerTool;

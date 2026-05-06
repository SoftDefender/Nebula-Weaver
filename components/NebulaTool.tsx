import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ParticleConfig, AnimationConfig, VideoConfig, ExportFormat, BatchItem } from '../types';
import NebulaCanvas from './NebulaCanvas';
import { analyzeNebulaImage, identifyNebulaFromImage } from '../services/geminiService';
import { detectStarsFromImage } from '../services/starDetectionService';
import { buildNebulaExportFilename } from '../services/videoExportNaming';
import {
  SparklesIcon,
  FilmIcon,
  ArrowPathIcon,
  CloudArrowUpIcon,
  AdjustmentsHorizontalIcon,
  VideoCameraIcon,
  PhotoIcon,
  TagIcon,
  CheckCircleIcon,
  Bars3Icon,
  XMarkIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon
} from '@heroicons/react/24/solid';
interface NebulaToolProps {
  onBack: () => void;
}

const NebulaTool: React.FC<NebulaToolProps> = ({ onBack }) => {
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0); 
  const [analysisStep, setAnalysisStep] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);
  const dragDepthRef = useRef(0);
  
  // Mobile UI States
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [particleConfig, setParticleConfig] = useState<ParticleConfig>({
    density: 200,
    baseSize: 1.2,
    brightness: 2.2, 
    color: '#ffffff',
    feathering: -0.3,
    spikeGain: 0.1,
    spikeThreshold: 0.7,
    spikeAngle: 45
  });

  const [animationConfig, setAnimationConfig] = useState<AnimationConfig>({
    initialScale: 1.0,
    finalScale: 1.4,
    rotationDirection: 'cw',
    rotationSpeed: 0.4,
    duration: 6,
  });

  const [videoConfig, setVideoConfig] = useState<VideoConfig>({
    resolution: 'original',
    bitrate: 40, 
    format: 'webm',
    fps: 30
  });

  const activeItem = useMemo(() => batchItems[activeIndex] || null, [batchItems, activeIndex]);
  const canRenderActiveItem = !!activeItem && activeItem.isVisible !== false;

  const processFilesIntoBatchItems = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return [];
    const newItems: BatchItem[] = await Promise.all(
      imageFiles.map(async (file) => {
        return new Promise<BatchItem>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              id: Math.random().toString(36).substr(2, 9),
              name: file.name.split('.')[0],
              imageBase64: reader.result as string,
              isVisible: true,
              status: 'idle',
              detectedParticles: null,
              detectionMode: 'procedural',
              zoomOrigin: { x: 0.5, y: 0.5 }
            });
          };
          reader.readAsDataURL(file);
        });
      })
    );
    return newItems;
  }, []);

  const appendBatchItems = useCallback(
    (newItems: BatchItem[]) => {
      if (newItems.length === 0) return;
      const queueWasEmpty = batchItems.length === 0;
      setBatchItems(prev => [...prev, ...newItems]);
      if (queueWasEmpty) setActiveIndex(0);
      if (isMobile) setShowLeftSidebar(false);
    },
    [batchItems.length, isMobile]
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const newItems = await processFilesIntoBatchItems(files);
      appendBatchItems(newItems);
    },
    [appendBatchItems, processFilesIntoBatchItems]
  );

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      await importFiles(files);
      e.target.value = '';
    },
    [importFiles]
  );

  const handleCanvasDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOverCanvas(true);
  }, []);

  const handleCanvasDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleCanvasDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOverCanvas(false);
    }
  }, []);

  const handleCanvasDrop = useCallback(
    async (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOverCanvas(false);
      const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
      await importFiles(files);
    },
    [importFiles]
  );

  const toggleItemVisibility = useCallback((id: string) => {
    setBatchItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, isVisible: item.isVisible === false } : item
      )
    );
  }, []);

  const removeBatchItem = useCallback((id: string) => {
    setBatchItems(prev => {
      const removeIndex = prev.findIndex(item => item.id === id);
      if (removeIndex === -1) return prev;
      const next = prev.filter(item => item.id !== id);
      setActiveIndex(current => {
        if (next.length === 0) return 0;
        if (current > removeIndex) return current - 1;
        if (current === removeIndex) return Math.min(current, next.length - 1);
        return current;
      });
      return next;
    });
  }, []);

  const handleBatchAnalysis = async () => {
    if (batchItems.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    const totalItems = batchItems.length;
    let currentItems = [...batchItems];

    for (let i = 0; i < totalItems; i++) {
      setAnalysisStep(`Processing ${i + 1}/${totalItems}...`);
      currentItems[i].status = 'analyzing';
      setBatchItems([...currentItems]);
      setActiveIndex(i);

      try {
        const item = currentItems[i];
        const aiName = await identifyNebulaFromImage(item.imageBase64);
        currentItems[i].name = aiName !== "Unknown Nebula" ? aiName : item.name;

        const [analysisResult, imageStars] = await Promise.all([
          analyzeNebulaImage(item.imageBase64, currentItems[i].name),
          detectStarsFromImage(item.imageBase64)
        ]);

        currentItems[i].analysis = analysisResult;
        currentItems[i].detectedParticles = imageStars;
        currentItems[i].status = 'success';
      } catch (error) {
        currentItems[i].status = 'error';
      }
      setAnalysisProgress(((i + 1) / totalItems) * 100);
      setBatchItems([...currentItems]);
    }

    setIsAnalyzing(false);
    setAnalysisStep('');
  };

  const updateItemName = (newName: string) => {
    if (!activeItem) return;
    setBatchItems(prev => prev.map(item => 
      item.id === activeItem.id ? { ...item, name: newName } : item
    ));
  };

  return (
    <div className="h-screen bg-rv-bg flex flex-col font-sans overflow-hidden">
      <header className="h-12 bg-rv-panel border-b border-rv-border flex items-center justify-between px-4 shrink-0 z-50">
        <div className="flex items-center gap-3">
           <button 
             onClick={() => setShowLeftSidebar(!showLeftSidebar)}
             className="lg:hidden p-1.5 text-rv-subtext hover:text-white bg-rv-surface rounded-sm border border-rv-border"
           >
             <Bars3Icon className="w-5 h-5" />
           </button>
           <div onClick={onBack} className="flex items-center gap-2 cursor-pointer group">
              <div className="bg-rv-accent p-1.5 rounded-sm group-hover:bg-rv-accentHover transition-colors">
                <SparklesIcon className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold tracking-tight text-rv-text">NEBULA<span className="font-light text-rv-subtext hidden sm:inline">WEAVER</span></span>
           </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block text-[10px] font-mono text-rv-subtext uppercase tracking-widest">Astra Engine v2.0</div>
          <button 
            onClick={() => setShowRightSidebar(!showRightSidebar)}
            className="lg:hidden p-1.5 text-rv-subtext hover:text-white bg-rv-surface rounded-sm border border-rv-border ml-2"
          >
            <AdjustmentsHorizontalIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Control: Asset Queue */}
        <aside className={`
          fixed lg:relative inset-y-0 left-0 w-64 bg-rv-panel border-r border-rv-border flex flex-col shrink-0 z-40 transition-transform duration-300
          ${showLeftSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
           <div className="p-4 space-y-6 flex-1 overflow-hidden flex flex-col">
              <div className="flex lg:hidden justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase text-rv-accent tracking-widest">Workspace</span>
                <button onClick={() => setShowLeftSidebar(false)}><XMarkIcon className="w-5 h-5 text-rv-subtext" /></button>
              </div>
              <div className="space-y-3">
                 <span className="text-[10px] font-bold uppercase tracking-wider text-rv-subtext flex items-center gap-2">
                    <CloudArrowUpIcon className="w-3.5 h-3.5" /> Source Assets
                 </span>
                 <input type="file" id="neb-upload" multiple accept="image/*" onChange={handleImageUpload} className="hidden" />
                 <label htmlFor="neb-upload" className="w-full h-8 bg-rv-surface border border-rv-border hover:border-rv-accent text-rv-text text-[10px] font-bold uppercase rounded-sm flex items-center justify-center gap-2 cursor-pointer transition-all">
                    Upload Images
                 </label>
                 <button 
                  onClick={handleBatchAnalysis}
                  disabled={isAnalyzing || batchItems.length === 0}
                  className="w-full h-8 bg-rv-accent hover:bg-rv-accentHover text-white text-[10px] font-bold uppercase rounded-sm flex items-center justify-center gap-2 transition-all disabled:opacity-30 shadow-lg"
                 >
                    <ArrowPathIcon className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} /> Run AI Analysis
                 </button>
              </div>

              {isAnalyzing && (
                 <div className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-rv-subtext">
                       <span>{analysisStep}</span>
                       <span>{Math.round(analysisProgress)}%</span>
                    </div>
                    <div className="h-1 bg-rv-border rounded-full overflow-hidden">
                       <div className="h-full bg-rv-accent transition-all duration-300" style={{ width: `${analysisProgress}%` }}></div>
                    </div>
                 </div>
              )}

              <div className="space-y-3 flex-1 overflow-hidden flex flex-col pt-4 border-t border-rv-border">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rv-subtext">Queue Pool</span>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                   {batchItems.map((item, idx) => (
                      <div key={item.id} onClick={() => { setActiveIndex(idx); if (isMobile) setShowLeftSidebar(false); }} className={`p-2 rounded-sm border cursor-pointer transition-all ${idx === activeIndex ? 'bg-rv-accent/10 border-rv-accent' : 'bg-rv-surface border-rv-border hover:bg-rv-surface/80'} ${item.isVisible === false ? 'opacity-60' : ''}`}>
                         <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium text-rv-text truncate">{item.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleItemVisibility(item.id); }}
                                className="p-1 rounded-sm text-rv-subtext hover:text-rv-text hover:bg-rv-border/40 transition-colors"
                                title={item.isVisible === false ? 'Show Layer' : 'Hide Layer'}
                                aria-label={item.isVisible === false ? 'Show Layer' : 'Hide Layer'}
                              >
                                {item.isVisible === false ? <EyeSlashIcon className="w-3 h-3" /> : <EyeIcon className="w-3 h-3" />}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeBatchItem(item.id); }}
                                className="p-1 rounded-sm text-rv-subtext hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Delete Layer"
                                aria-label="Delete Layer"
                              >
                                <TrashIcon className="w-3 h-3" />
                              </button>
                              <div className={`w-1.5 h-1.5 rounded-full ${item.status === 'success' ? 'bg-green-500 shadow-[0_0_5px_green]' : item.status === 'analyzing' ? 'bg-blue-500 animate-pulse' : 'bg-rv-subtext'}`}></div>
                            </div>
                         </div>
                       </div>
                    ))}
                   {batchItems.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-20 p-4">
                         <PhotoIcon className="w-8 h-8 mb-2" />
                         <span className="text-[8px] uppercase tracking-widest font-black">Empty Queue</span>
                      </div>
                   )}
                </div>
              </div>
           </div>
        </aside>

        {/* Center Viewport: Render Area */}
        <section
          className="flex-1 relative bg-black flex flex-col overflow-hidden"
          onDragEnter={handleCanvasDragEnter}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
        >
           <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              <NebulaCanvas 
                imageBase64={canRenderActiveItem ? activeItem?.imageBase64 || null : null}
                particleConfig={particleConfig}
                animationConfig={animationConfig}
                videoConfig={videoConfig}
                analysis={activeItem?.analysis}
                detectedParticles={activeItem?.detectedParticles}
                isRecording={isGenerating}
                onRecordingComplete={(url, mimeType) => {
                  setIsGenerating(false);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = buildNebulaExportFilename(activeItem?.name, mimeType);
                  link.click();
                  // Release temporary object URL after the browser has consumed it.
                  setTimeout(() => URL.revokeObjectURL(url), 5000);
                }}
                onRecordingError={() => {
                  setIsGenerating(false);
                }}
                zoomOrigin={activeItem?.zoomOrigin || {x:0.5, y:0.5}}
                onSetZoomOrigin={(x, y) =>
                  setBatchItems(prev => {
                    const copy = [...prev];
                    if (!copy[activeIndex]) return prev;
                    copy[activeIndex].zoomOrigin = { x, y };
                    return copy;
                  })
                }
              />
              {isDragOverCanvas && (
                <div className="absolute inset-0 z-20 border-2 border-dashed border-rv-accent bg-rv-accent/10 flex items-center justify-center pointer-events-none">
                  <div className="px-4 py-2 rounded-sm bg-black/70 text-white text-xs font-bold uppercase tracking-widest">
                    Drop images to import
                  </div>
                </div>
              )}
           </div>
           
           <div className="h-auto py-2 px-4 bg-rv-panel border-t border-rv-border flex flex-wrap items-center justify-between shrink-0 gap-3">
              <div className="flex items-center gap-3">
                 <div className="text-[10px] text-rv-subtext uppercase font-bold tracking-widest hidden sm:block">Viewport Telemetry</div>
                 {activeItem?.status === 'success' && (
                    <div className="flex items-center gap-1.5 bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full border border-green-500/20 text-[9px] font-bold uppercase tracking-tighter">
                       <CheckCircleIcon className="w-2.5 h-2.5" /> AI Calibrated
                    </div>
                 )}
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                   onClick={() => setIsGenerating(true)}
                   disabled={!canRenderActiveItem || isGenerating}
                   className="w-full sm:w-auto px-6 lg:px-8 h-9 bg-rv-text hover:bg-white text-rv-bg text-[10px] font-black uppercase tracking-widest rounded-sm transition-all shadow-xl disabled:opacity-30 flex items-center justify-center gap-2"
                  >
                    <VideoCameraIcon className="w-4 h-4" /> <span className="sm:hidden">Export</span><span className="hidden sm:inline">Initialize Video Export</span>
                 </button>
              </div>
           </div>
        </section>

        {/* Right Sidebar: Settings & Meta */}
        <aside className={`
          fixed lg:relative inset-y-0 right-0 w-80 bg-rv-panel border-l border-rv-border flex flex-col shrink-0 z-40 transition-transform duration-300
          ${showRightSidebar ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}>
           <div className="p-4 space-y-8 overflow-y-auto custom-scrollbar flex-1">
              <div className="flex lg:hidden justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase text-rv-accent tracking-widest">Configuration</span>
                <button onClick={() => setShowRightSidebar(false)}><XMarkIcon className="w-5 h-5 text-rv-subtext" /></button>
              </div>
              {/* Nebula Identity Section */}
              <div className="space-y-4">
                 <span className="text-[10px] font-bold uppercase tracking-widest text-rv-subtext flex items-center gap-2">
                    <TagIcon className="w-3.5 h-3.5" /> Nebula Identity
                 </span>
                 <div className="space-y-3">
                    <div>
                       <div className="text-[9px] text-rv-subtext mb-1 uppercase tracking-tighter">Common Name / Designation</div>
                       <input 
                          type="text" 
                          value={activeItem?.name || ""} 
                          onChange={(e) => updateItemName(e.target.value)}
                          placeholder="Enter nebula name..."
                          disabled={!activeItem}
                          className="w-full h-9 bg-rv-surface border border-rv-border rounded-sm px-3 text-xs font-bold text-rv-text focus:border-rv-accent outline-none transition-colors disabled:opacity-30"
                       />
                    </div>
                    {activeItem?.analysis && (
                       <div className="p-3 bg-rv-surface border border-rv-border rounded-sm animate-fade-in">
                          <div className="text-[8px] font-bold text-rv-accent uppercase mb-1">AI Description</div>
                          <p className="text-[10px] text-rv-subtext italic leading-relaxed">"{activeItem.analysis.description}"</p>
                       </div>
                    )}
                 </div>
              </div>

              {/* Particle Dynamics */}
              <div className="space-y-4 pt-6 border-t border-rv-border">
                 <span className="text-[10px] font-bold uppercase tracking-widest text-rv-subtext block">Particle Dynamics</span>
                 <div className="space-y-4">
                    <div>
                       <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Density</span><span className="text-rv-text">{particleConfig.density}</span></div>
                       <input type="range" min="50" max="1000" step="10" value={particleConfig.density} onChange={(e) => setParticleConfig({...particleConfig, density: parseInt(e.target.value)})} />
                    </div>
                    <div>
                       <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Star Size</span><span className="text-rv-text">{particleConfig.baseSize.toFixed(1)}</span></div>
                       <input type="range" min="0.5" max="3" step="0.1" value={particleConfig.baseSize} onChange={(e) => setParticleConfig({...particleConfig, baseSize: parseFloat(e.target.value)})} />
                    </div>
                    <div>
                       <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Luminance</span><span className="text-rv-text">{particleConfig.brightness.toFixed(1)}</span></div>
                       <input type="range" min="0.5" max="5" step="0.1" value={particleConfig.brightness} onChange={(e) => setParticleConfig({...particleConfig, brightness: parseFloat(e.target.value)})} />
                    </div>
                 </div>
              </div>

              {/* Star Spike Controls */}
              <div className="space-y-4 pt-6 border-t border-rv-border">
                 <span className="text-[10px] font-bold uppercase tracking-widest text-rv-subtext block">Star Spikes</span>
                 <div className="space-y-4">
                    <div>
                       <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Spike Gain</span><span className="text-rv-text">{particleConfig.spikeGain.toFixed(2)}</span></div>
                       <input type="range" min="0" max="1.5" step="0.05" value={particleConfig.spikeGain} onChange={(e) => setParticleConfig({...particleConfig, spikeGain: parseFloat(e.target.value)})} />
                    </div>
                    <div>
                       <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Spike Threshold</span><span className="text-rv-text">{particleConfig.spikeThreshold.toFixed(2)}</span></div>
                       <input type="range" min="0.1" max="3" step="0.05" value={particleConfig.spikeThreshold} onChange={(e) => setParticleConfig({...particleConfig, spikeThreshold: parseFloat(e.target.value)})} />
                    </div>
                    <div>
                       <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Spike Angle</span><span className="text-rv-text">{particleConfig.spikeAngle}°</span></div>
                       <input type="range" min="0" max="180" step="1" value={particleConfig.spikeAngle} onChange={(e) => setParticleConfig({...particleConfig, spikeAngle: parseInt(e.target.value)})} />
                    </div>
                 </div>
              </div>

              {/* Space Animation */}
              <div className="space-y-4 pt-6 border-t border-rv-border">
                 <span className="text-[10px] font-bold uppercase tracking-widest text-rv-subtext block">Kinematics</span>
                 <div className="space-y-4">
                    <div>
                       <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Warp Intensity</span><span className="text-rv-text">{animationConfig.finalScale.toFixed(1)}x</span></div>
                       <input type="range" min="1" max="2.5" step="0.1" value={animationConfig.finalScale} onChange={(e) => setAnimationConfig({...animationConfig, finalScale: parseFloat(e.target.value)})} />
                    </div>
                    <div>
                       <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Loop Duration</span><span className="text-rv-text">{animationConfig.duration}s</span></div>
                       <input type="range" min="3" max="30" step="1" value={animationConfig.duration} onChange={(e) => setAnimationConfig({...animationConfig, duration: parseInt(e.target.value)})} />
                    </div>
                 </div>
              </div>

              {/* Export Profile */}
              <div className="space-y-4 pt-6 border-t border-rv-border">
                 <span className="text-[10px] font-bold uppercase tracking-widest text-rv-subtext block">Export Profile</span>
                 <div className="grid grid-cols-3 gap-2">
                    {['original', '1080p', '4k'].map(res => (
                       <button 
                        key={res}
                        onClick={() => setVideoConfig({...videoConfig, resolution: res as any})}
                        className={`h-7 rounded-sm text-[9px] font-bold uppercase border transition-all ${videoConfig.resolution === res ? 'bg-rv-accent text-white border-rv-accent' : 'bg-rv-surface border-rv-border text-rv-subtext'}`}
                       >
                          {res}
                       </button>
                    ))}
                 </div>
                 <div>
                    <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Frame Rate</span><span className="text-rv-text">{videoConfig.fps} fps</span></div>
                    <input type="range" min="12" max="60" step="1" value={videoConfig.fps} onChange={(e) => setVideoConfig({...videoConfig, fps: parseInt(e.target.value)})} />
                 </div>
                 <div>
                    <div className="flex justify-between text-[10px] text-rv-subtext mb-1"><span>Bitrate</span><span className="text-rv-text">{videoConfig.bitrate} Mbps</span></div>
                    <input type="range" min="2" max="120" step="1" value={videoConfig.bitrate} onChange={(e) => setVideoConfig({...videoConfig, bitrate: parseInt(e.target.value)})} />
                 </div>
                 <div className="space-y-2">
                    <div className="text-[10px] text-rv-subtext">Container</div>
                    <div className="grid grid-cols-4 gap-2">
                      {(['webm', 'mp4', 'mov', 'mkv'] as ExportFormat[]).map(format => (
                        <button
                          key={format}
                          onClick={() => setVideoConfig({ ...videoConfig, format })}
                          className={`h-7 rounded-sm text-[9px] font-bold uppercase border transition-all ${videoConfig.format === format ? 'bg-rv-accent text-white border-rv-accent' : 'bg-rv-surface border-rv-border text-rv-subtext'}`}
                        >
                          {format}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-rv-subtext leading-snug">
                      WebM has the broadest MediaRecorder compatibility and is recommended for reliable playback.
                    </p>
                    <p className="text-[9px] text-rv-subtext leading-snug">
                      Large-image export keeps original resolution; if MP4 is unstable it may auto-fallback to WebM without downscaling.
                    </p>
                 </div>
              </div>
           </div>

           <div className="p-4 bg-rv-surface border-t border-rv-border mt-auto">
              <button 
                onClick={() => { setIsGenerating(true); if (isMobile) setShowRightSidebar(false); }}
                disabled={!canRenderActiveItem || isGenerating}
                className="w-full h-10 bg-rv-accent hover:bg-rv-accentHover text-white text-[10px] font-black uppercase tracking-widest rounded-sm flex items-center justify-center gap-2 transition-all shadow-xl disabled:opacity-30"
              >
                 <FilmIcon className="w-4 h-4" /> Finalize Render
              </button>
           </div>
        </aside>

        {/* Mobile Overlays */}
        {(showLeftSidebar || showRightSidebar) && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => { setShowLeftSidebar(false); setShowRightSidebar(false); }}
          />
        )}
      </main>
    </div>
  );
};
export default NebulaTool;


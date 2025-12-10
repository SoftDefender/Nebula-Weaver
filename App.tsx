import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { ParticleConfig, AnimationConfig, VideoConfig, Particle, ExportFormat, BatchItem } from './types';
import NebulaCanvas from './components/NebulaCanvas';
import PhotoFramerTool from './components/PhotoFramerTool';
import { analyzeNebulaImage, identifyNebulaFromImage } from './services/geminiService';
import { detectStarsFromImage } from './services/starDetectionService';
import { 
  SparklesIcon, 
  FilmIcon, 
  ArrowPathIcon, 
  CloudArrowUpIcon,
  Cog6ToothIcon,
  AdjustmentsHorizontalIcon,
  VideoCameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Square2StackIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  HomeIcon,
  RocketLaunchIcon,
  CubeTransparentIcon,
  PhotoIcon
} from '@heroicons/react/24/solid';

// --- Sub-Page: The Nebula Weaver Tool ---

interface NebulaToolProps {
  onBack: () => void;
}

const NebulaTool: React.FC<NebulaToolProps> = ({ onBack }) => {
  // Batch State
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Global UI State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0); 
  const [analysisStep, setAnalysisStep] = useState('');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchExportIndex, setBatchExportIndex] = useState<number | null>(null);

  // Store multiple generated videos
  const [generatedVideos, setGeneratedVideos] = useState<{url: string, name: string}[]>([]);
  
  const [previewTrigger, setPreviewTrigger] = useState(0);
  
  // Configuration State (Shared across batch)
  const [particleConfig, setParticleConfig] = useState<ParticleConfig>({
    density: 150,
    baseSize: 1.4,
    brightness: 2.0, 
    color: '#ffffff',
    feathering: -0.4,
    spikeGain: 0.0,
    spikeThreshold: 0.8,
    spikeAngle: 45 // Default 45 degrees
  });

  const [animationConfig, setAnimationConfig] = useState<AnimationConfig>({
    initialScale: 1.0,
    finalScale: 1.5,
    rotationDirection: 'cw',
    rotationSpeed: 0.5,
    duration: 5,
    // zoomOrigin removed from global config
  });

  const [videoConfig, setVideoConfig] = useState<VideoConfig>({
    resolution: 'original',
    bitrate: 50, 
    format: 'mp4',
    fps: 60
  });

  // Derived State for Active Item
  const activeItem = useMemo(() => batchItems[activeIndex] || null, [batchItems, activeIndex]);

  // Handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Fix: Explicitly cast to File[] to avoid 'unknown' type errors
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    // Limit based on device
    const isMobileWidth = window.innerWidth < 768;
    const maxFiles = isMobileWidth ? 5 : 10;

    const filesToProcess = files.slice(0, maxFiles);
    
    if (files.length > maxFiles) {
      console.warn(`Upload limited to ${maxFiles} files on ${isMobileWidth ? 'mobile' : 'desktop'}.`);
    }
    
    // Read all files to Base64
    const newItems: BatchItem[] = await Promise.all(filesToProcess.map(async (file) => {
      return new Promise<BatchItem>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name.split('.')[0], // Default to filename initially
            imageBase64: reader.result as string,
            status: 'idle',
            detectedParticles: null,
            detectionMode: 'procedural',
            zoomOrigin: { x: 0.5, y: 0.5 } // Default Center
          });
        };
        reader.readAsDataURL(file);
      });
    }));

    setBatchItems(newItems);
    setActiveIndex(0);
    setGeneratedVideos([]); // Clear previous results

    // If SINGLE file, perform standard "Auto Identify Name" but don't full analyze yet (Original Logic)
    if (newItems.length === 1) {
       const item = newItems[0];
       const name = await identifyNebulaFromImage(item.imageBase64);
       // Check if name is generic unknown, if so keep filename
       if (!name.toLowerCase().includes('unknown')) {
          setBatchItems(prev => {
            const copy = [...prev];
            copy[0] = { ...copy[0], identifiedName: name };
            return copy;
          });
       }
    }
  };

  const handleBatchAnalysis = async () => {
    if (batchItems.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    const totalItems = batchItems.length;
    
    // Deep copy to modify
    let currentItems = [...batchItems];

    for (let i = 0; i < totalItems; i++) {
      setAnalysisStep(`Analyzing ${i + 1}/${totalItems}: ${currentItems[i].name}...`);
      
      // Update status to analyzing
      currentItems[i].status = 'analyzing';
      setBatchItems([...currentItems]);
      setActiveIndex(i); // Show user what is being processed

      try {
        const item = currentItems[i];
        
        // 1. Identify Name (If not already identified or if in batch mode we trust AI)
        // In Batch Mode: Unify use AI recommended result
        let nameToUse = item.name;
        if (totalItems > 1 || !item.identifiedName) {
           const aiName = await identifyNebulaFromImage(item.imageBase64);
           
           // Only overwrite if AI name is not "Unknown"
           if (!aiName.toLowerCase().includes('unknown')) {
               currentItems[i].identifiedName = aiName;
               currentItems[i].name = aiName; 
               nameToUse = aiName;
           } else {
               currentItems[i].identifiedName = "Unknown Nebula";
               // Do NOT overwrite item.name here, keep original filename
               nameToUse = item.name; 
           }
        } else {
           // Single item mode: use whatever is in .name (could be user edited)
           nameToUse = item.name;
        }

        // 2. Analyze Image & Map in Parallel
        const [analysisResult, imageStars] = await Promise.all([
          analyzeNebulaImage(item.imageBase64, nameToUse),
          detectStarsFromImage(item.imageBase64)
        ]);

        currentItems[i].analysis = analysisResult;

        // 3. Determine Particles
        if (imageStars.length > 50) {
          currentItems[i].detectedParticles = imageStars;
          currentItems[i].detectionMode = 'real';
        } else if (analysisResult.starHotspots && analysisResult.starHotspots.length > 0) {
           // Fallback AI Map Logic
           const aiParticles: Particle[] = [];
           const CLUSTER_SIZE = 50;
           analysisResult.starHotspots.forEach(spot => {
             for(let k=0; k<CLUSTER_SIZE; k++) {
                const offsetX = (Math.random() - 0.5) * 0.15; 
                const offsetY = (Math.random() - 0.5) * 0.15;
                const x = (spot.x / 100) + offsetX;
                const y = (spot.y / 100) + offsetY;
                if(x >=0 && x<=1 && y>=0 && y<=1) {
                   aiParticles.push({
                     x, y,
                     z: Math.pow(Math.random(), 3) * 5.0,
                     scale: 0.5 + Math.random(),
                     color: analysisResult.dominantColors?.[0] || '#ffffff',
                     alpha: 0.5 + Math.random() * 0.5
                   });
                }
             }
           });
           currentItems[i].detectedParticles = aiParticles;
           currentItems[i].detectionMode = 'ai-map';
        } else {
           currentItems[i].detectedParticles = null;
           currentItems[i].detectionMode = 'procedural';
        }

        currentItems[i].status = 'success';

      } catch (error) {
        console.error("Batch Error", error);
        currentItems[i].status = 'error';
      }

      setAnalysisProgress(((i + 1) / totalItems) * 100);
      setBatchItems([...currentItems]);
    }

    setIsAnalyzing(false);
    setAnalysisStep('');
    setAnalysisProgress(100);
    setPreviewTrigger(prev => prev + 1);
  };

  const handleApplyAiName = () => {
    if (activeItem?.identifiedName) {
       updateActiveItem({ name: activeItem.identifiedName });
    }
  };

  const updateActiveItem = (updates: Partial<BatchItem>) => {
    setBatchItems(prev => {
      const copy = [...prev];
      copy[activeIndex] = { ...copy[activeIndex], ...updates };
      return copy;
    });
  };

  // --- Export Logic ---
  
  const handleGenerateVideo = () => {
    if (!activeItem) return;
    setIsGenerating(true);
    // Don't clear generatedVideos here if you want to keep history, or clear if single mode
    if (batchItems.length === 1) setGeneratedVideos([]);
  };

  // Batch Export Trigger
  const handleExportAll = () => {
    if (batchItems.length === 0) return;
    setGeneratedVideos([]); 
    setIsGenerating(false); // Do NOT start until component remounts/signals ready
    setBatchExportIndex(0); 
    setActiveIndex(0); // Start at beginning
  };

  // Handshake: Called by NebulaCanvas when a new image is fully loaded and painted
  const handleImageReady = useCallback(() => {
     // If we are in the middle of a batch export sequence, AND we are at the correct index
     if (batchExportIndex !== null && batchExportIndex === activeIndex) {
         if (!isGenerating) {
             console.log("Image Ready signal received. Starting Generation for index:", activeIndex);
             // Small buffer time to ensure UI/State is settled
             setTimeout(() => setIsGenerating(true), 200);
         }
     }
  }, [batchExportIndex, activeIndex, isGenerating]);


  // Export Completion Handler
  const handleRecordingComplete = useCallback((url: string) => {
    setIsGenerating(false);
    
    // Get current item info
    const currentName = batchItems[activeIndex]?.name || 'nebula';
    
    // Auto Download Helper
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    
    // Filename logic
    let ext: string = videoConfig.format;
    
    downloadLink.download = `${currentName}-animation.${ext}`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // Add to history
    setGeneratedVideos(prev => [...prev, { url, name: currentName }]);

    // Move to next item in batch
    if (batchExportIndex !== null) {
      setBatchExportIndex(prev => {
        if (prev !== null && prev < batchItems.length - 1) {
          const nextIndex = prev + 1;
          setActiveIndex(nextIndex); // Trigger state change -> triggers component remount
          return nextIndex;
        } else {
          return null; // Finished
        }
      });
    }
  }, [batchExportIndex, batchItems, activeIndex, videoConfig.format]);


  const handleSetZoomOrigin = (x: number, y: number) => {
    updateActiveItem({ zoomOrigin: { x, y } });
  };

  const handlePrev = () => {
     setActiveIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
     setActiveIndex(prev => Math.min(batchItems.length - 1, prev + 1));
  };

  return (
    <div className="min-h-screen font-sans bg-sc-gray pb-20">
      
      {/* Header Bar - SC Dark Style */}
      <header className="bg-sc-dark w-full sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto h-14 px-4 flex items-center justify-between">
            <div className="flex items-center gap-6">
                <div onClick={onBack} className="cursor-pointer flex items-center gap-2 group">
                    <div className="bg-sc-primary w-8 h-8 flex items-center justify-center rounded-[3px] group-hover:bg-sc-primaryHover transition-colors">
                        <SparklesIcon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-white font-bold text-lg tracking-tight">NEBULA<span className="font-normal opacity-80">WEAVER</span></span>
                </div>
                
                <nav className="hidden md:flex gap-4 text-sm font-medium text-gray-300">
                    <button onClick={onBack} className="hover:text-white transition-colors">Home</button>
                    <button className="text-white border-b-2 border-sc-primary pb-3.5 mt-3.5">Generator</button>
                    <button className="hover:text-white transition-colors">Library</button>
                </nav>
            </div>
            
            <div className="text-xs text-gray-400 font-medium">
                Gemini 2.5 Powered
            </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="max-w-7xl mx-auto px-4 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Sidebar: Source Material */}
        <section className="lg:col-span-3 space-y-4">
           <div className="bg-sc-card border border-sc-border rounded-sm p-5 shadow-sc">
              <h2 className="text-xs font-bold uppercase text-sc-subtext mb-4 border-b border-sc-border pb-2">Source Files</h2>
              
              <div className="space-y-4">
                <input 
                  type="file" 
                  id="file-upload"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={batchExportIndex !== null || isAnalyzing}
                  className="hidden"
                />
                <label 
                  htmlFor="file-upload"
                  className={`block w-full py-2 px-4 text-sm font-medium text-center border rounded-[3px] cursor-pointer transition-all ${
                    isAnalyzing || batchExportIndex !== null 
                    ? 'bg-gray-100 text-gray-400 border-transparent cursor-not-allowed'
                    : 'bg-white border-sc-border text-sc-text hover:border-sc-primary hover:text-sc-primary'
                  }`}
                >
                  Upload Images
                </label>
                
                <div className="flex justify-between text-[10px] text-sc-subtext px-1">
                   <span>Max 5 (Mobile) / 10 (Desktop)</span>
                </div>

                {activeItem && (
                    <div className="bg-sc-gray p-3 rounded-[3px] border border-sc-border space-y-2">
                        <label className="text-[10px] font-bold text-sc-subtext uppercase block">Current Project</label>
                        <input 
                            type="text" 
                            value={activeItem.name}
                            onChange={(e) => updateActiveItem({ name: e.target.value })}
                            placeholder={activeItem.identifiedName || "Name your nebula..."}
                            disabled={batchItems.length > 1}
                            className="w-full bg-white border border-sc-border focus:border-sc-primary rounded-[3px] px-2 py-1.5 text-xs text-sc-text focus:outline-none transition-colors"
                        />
                        {activeItem.identifiedName && batchItems.length === 1 && (
                            <div className="flex justify-between items-center pt-1">
                                <span className="text-[10px] text-sc-subtext truncate max-w-[120px]">{activeItem.identifiedName}</span>
                                <button onClick={handleApplyAiName} className="text-[10px] text-sc-primary font-bold hover:underline">Apply</button>
                            </div>
                        )}
                    </div>
                )}
                
                <button 
                    onClick={handleBatchAnalysis}
                    disabled={isAnalyzing || batchItems.length === 0 || batchExportIndex !== null}
                    className={`w-full py-2 rounded-[3px] text-sm font-bold transition-colors ${
                      isAnalyzing 
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                        : 'bg-sc-primary hover:bg-sc-primaryHover text-white'
                    }`}
                >
                    {isAnalyzing ? (
                        <div className="flex items-center justify-center gap-2">
                            <ArrowPathIcon className="w-4 h-4 animate-spin" /> Processing...
                        </div>
                    ) : (
                        `Analyze ${batchItems.length > 1 ? `Batch (${batchItems.length})` : 'Image'}`
                    )}
                </button>
                
                {isAnalyzing && (
                    <div className="space-y-1">
                        <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-sc-primary transition-all duration-300" style={{ width: `${analysisProgress}%` }}></div>
                        </div>
                        <div className="text-[10px] text-sc-subtext truncate">{analysisStep}</div>
                    </div>
                )}
                
                {activeItem?.status === 'success' && !isAnalyzing && (
                    <div className="flex items-center gap-2 text-[11px] text-green-600 bg-green-50 px-2 py-1 rounded-[3px] border border-green-100">
                        <CheckCircleIcon className="w-3 h-3" />
                        <span>Ready ({activeItem.detectionMode})</span>
                    </div>
                )}
              </div>
           </div>
           
           {/* Active Batch List (Sidebar) */}
           {batchItems.length > 0 && (
             <div className="bg-sc-card border border-sc-border rounded-sm p-0 shadow-sc overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-sc-border text-xs font-bold text-sc-subtext uppercase">Queue ({batchItems.length})</div>
                <div className="max-h-48 overflow-y-auto">
                    {batchItems.map((item, idx) => (
                        <div 
                            key={item.id}
                            onClick={() => setActiveIndex(idx)}
                            className={`px-4 py-2 text-xs flex items-center justify-between cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 ${idx === activeIndex ? 'bg-blue-50 text-sc-primary font-medium' : 'text-sc-text'}`}
                        >
                            <span className="truncate max-w-[70%]">{idx+1}. {item.name || 'Untitled'}</span>
                            <div className={`w-2 h-2 rounded-full ${item.status === 'success' ? 'bg-green-500' : item.status === 'analyzing' ? 'bg-yellow-400' : 'bg-gray-300'}`}></div>
                        </div>
                    ))}
                </div>
             </div>
           )}
        </section>

        {/* Middle Column: Canvas & Player */}
        <section className="lg:col-span-6 flex flex-col gap-6">
            <div className="bg-sc-card border border-sc-border rounded-[3px] shadow-sc overflow-hidden relative">
                
                {/* Canvas Area */}
                <div className="bg-black aspect-[4/3] relative group">
                    <NebulaCanvas 
                        key={activeItem?.id || 'canvas-placeholder'}
                        imageBase64={activeItem?.imageBase64 || null}
                        particleConfig={particleConfig}
                        animationConfig={animationConfig}
                        videoConfig={videoConfig}
                        analysis={activeItem?.analysis}
                        detectedParticles={activeItem?.detectedParticles || null}
                        isRecording={isGenerating}
                        onRecordingComplete={handleRecordingComplete}
                        triggerPreview={previewTrigger}
                        zoomOrigin={activeItem?.zoomOrigin || { x: 0.5, y: 0.5 }}
                        onSetZoomOrigin={handleSetZoomOrigin}
                        onImageReady={handleImageReady}
                    />

                    {/* Batch Navigation Overlay */}
                    {batchItems.length > 1 && !isGenerating && batchExportIndex === null && (
                         <>
                            <button 
                                onClick={handlePrev} disabled={activeIndex === 0}
                                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white hover:bg-sc-primary rounded-[2px] disabled:opacity-0 transition-all"
                            >
                                <ChevronLeftIcon className="w-6 h-6" />
                            </button>
                            <button 
                                onClick={handleNext} disabled={activeIndex === batchItems.length - 1}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white hover:bg-sc-primary rounded-[2px] disabled:opacity-0 transition-all"
                            >
                                <ChevronRightIcon className="w-6 h-6" />
                            </button>
                         </>
                    )}
                    
                    {isGenerating && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-50">
                            <div className="w-12 h-12 border-4 border-sc-dark border-t-sc-primary rounded-full animate-spin mb-4"></div>
                            <div className="text-lg font-bold">Exporting...</div>
                            {batchExportIndex !== null && <div className="text-sm opacity-70">File {batchExportIndex + 1} of {batchItems.length}</div>}
                        </div>
                    )}
                </div>

                {/* Actions Bar */}
                <div className="p-4 bg-white border-t border-sc-border flex gap-4">
                     {batchItems.length > 1 && (
                        <button 
                            onClick={handleExportAll}
                            disabled={isGenerating || batchItems.length === 0 || batchExportIndex !== null}
                            className="flex-1 py-2 border border-sc-border hover:border-sc-text text-sc-text font-bold text-sm rounded-[3px] transition-all disabled:opacity-50"
                        >
                            Export All ({batchItems.length})
                        </button>
                     )}
                     <button 
                        onClick={handleGenerateVideo}
                        disabled={isGenerating || !activeItem || batchExportIndex !== null}
                        className="flex-1 py-2 bg-sc-primary hover:bg-sc-primaryHover text-white font-bold text-sm rounded-[3px] shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                     >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        {batchItems.length === 1 ? 'Download Video' : 'Download Current'}
                     </button>
                </div>
            </div>

            {/* Generated History */}
            {generatedVideos.length > 0 && batchExportIndex === null && (
                <div className="bg-sc-card border border-sc-border rounded-[3px] p-4 shadow-sc">
                    <div className="flex justify-between items-center mb-4 border-b border-sc-border pb-2">
                        <h3 className="text-xs font-bold uppercase text-sc-text">Generated ({generatedVideos.length})</h3>
                        <button onClick={() => setGeneratedVideos([])} className="text-[10px] text-sc-subtext hover:text-red-500">Clear</button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        {generatedVideos.map((video, idx) => (
                            <div key={idx} className="bg-sc-gray p-2 rounded-[3px] group">
                                <video src={video.url} controls className="w-full aspect-video bg-black mb-2" />
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold truncate max-w-[80px]">{video.name}</span>
                                    <a href={video.url} download={`${video.name}.${videoConfig.format}`} className="text-[10px] text-sc-primary hover:underline">Save</a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>

        {/* Right Sidebar: Configuration */}
        <section className="lg:col-span-3 space-y-4">
           <div className="bg-sc-card border border-sc-border rounded-[3px] p-5 shadow-sc">
               <h2 className="text-xs font-bold uppercase text-sc-subtext mb-5 border-b border-sc-border pb-2 flex items-center justify-between">
                   <span>Settings</span>
                   <Cog6ToothIcon className="w-3 h-3" />
               </h2>
               
               <div className="space-y-6">
                   {/* Format */}
                   <div className="space-y-2">
                       <label className="text-[11px] font-bold text-sc-text block">Export Format</label>
                       <div className="grid grid-cols-2 gap-2">
                           <select 
                               value={videoConfig.format}
                               onChange={(e) => setVideoConfig({...videoConfig, format: e.target.value as any})}
                               className="bg-sc-gray border border-sc-border rounded-[3px] text-xs px-2 py-1.5 focus:border-sc-primary outline-none"
                           >
                               <option value="mp4">MP4</option>
                               <option value="webm">WebM</option>
                           </select>
                           <select 
                               value={videoConfig.resolution}
                               onChange={(e) => setVideoConfig({...videoConfig, resolution: e.target.value as any})}
                               className="bg-sc-gray border border-sc-border rounded-[3px] text-xs px-2 py-1.5 focus:border-sc-primary outline-none"
                           >
                               <option value="original">Original</option>
                               <option value="1080p">1080p</option>
                               <option value="4k">4K</option>
                           </select>
                       </div>
                       <div className="flex items-center gap-2 pt-1">
                           <span className="text-[10px] text-sc-subtext w-12">Quality</span>
                           <input type="range" min="1" max="50" step="1" value={videoConfig.bitrate} onChange={(e) => setVideoConfig({...videoConfig, bitrate: parseFloat(e.target.value)})} />
                       </div>
                       <div className="flex items-center gap-2">
                           <span className="text-[10px] text-sc-subtext w-12">FPS {videoConfig.fps}</span>
                           <input type="range" min="15" max="120" step="1" value={videoConfig.fps} onChange={(e) => setVideoConfig({...videoConfig, fps: parseInt(e.target.value)})} />
                       </div>
                   </div>

                   <div className="h-px bg-sc-border"></div>

                   {/* Particles */}
                   <div className="space-y-3">
                       <label className="text-[11px] font-bold text-sc-text block">Particles</label>
                       
                       <div>
                           <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Density</span><span>{particleConfig.density}</span></div>
                           <input type="range" min="0" max="500" step="10" value={particleConfig.density} onChange={(e) => setParticleConfig({...particleConfig, density: parseFloat(e.target.value)})} />
                       </div>
                       
                       <div>
                           <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Size</span><span>{particleConfig.baseSize.toFixed(2)}</span></div>
                           <input type="range" min="0" max="2" step="0.01" value={particleConfig.baseSize} onChange={(e) => setParticleConfig({...particleConfig, baseSize: parseFloat(e.target.value)})} />
                       </div>

                       <div>
                           <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Brightness</span><span>{Math.round(particleConfig.brightness * 100)}%</span></div>
                           <input type="range" min="0" max="3" step="0.1" value={particleConfig.brightness} onChange={(e) => setParticleConfig({...particleConfig, brightness: parseFloat(e.target.value)})} />
                       </div>

                       <div>
                           <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Glow</span><span>{particleConfig.feathering.toFixed(1)}</span></div>
                           <input type="range" min="-3" max="3" step="0.1" value={particleConfig.feathering} onChange={(e) => setParticleConfig({...particleConfig, feathering: parseFloat(e.target.value)})} />
                       </div>
                       
                       <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-sc-subtext">Color</span>
                          <input type="color" value={particleConfig.color} onChange={(e) => setParticleConfig({...particleConfig, color: e.target.value})} className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer" />
                       </div>
                   </div>

                    <div className="h-px bg-sc-border"></div>

                    {/* Spikes */}
                   <div className="space-y-3">
                       <label className="text-[11px] font-bold text-sc-text block">Diffraction Spikes</label>
                       <div>
                           <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Intensity</span><span>{particleConfig.spikeGain.toFixed(2)}</span></div>
                           <input type="range" min="0" max="2" step="0.01" value={particleConfig.spikeGain} onChange={(e) => setParticleConfig({...particleConfig, spikeGain: parseFloat(e.target.value)})} />
                       </div>
                       <div>
                           <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Threshold</span><span>{particleConfig.spikeThreshold.toFixed(2)}</span></div>
                           <input type="range" min="0" max="4.0" step="0.01" value={particleConfig.spikeThreshold} onChange={(e) => setParticleConfig({...particleConfig, spikeThreshold: parseFloat(e.target.value)})} />
                       </div>
                       <div>
                           <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Angle</span><span>{particleConfig.spikeAngle}°</span></div>
                           <input type="range" min="0" max="180" step="1" value={particleConfig.spikeAngle} onChange={(e) => setParticleConfig({...particleConfig, spikeAngle: parseInt(e.target.value)})} />
                       </div>
                   </div>
                   
                   <div className="h-px bg-sc-border"></div>
                   
                   {/* Animation */}
                   <div className="space-y-3">
                       <label className="text-[11px] font-bold text-sc-text block">Movement</label>
                        <div className="grid grid-cols-2 gap-2">
                             <div>
                                <div className="text-[10px] text-sc-subtext mb-1">Scale Start</div>
                                <input type="number" step="0.1" value={animationConfig.initialScale} onChange={(e) => setAnimationConfig({...animationConfig, initialScale: parseFloat(e.target.value)})} className="w-full text-xs border border-sc-border p-1 rounded-[2px]" />
                             </div>
                             <div>
                                <div className="text-[10px] text-sc-subtext mb-1">Scale End</div>
                                <input type="number" step="0.1" value={animationConfig.finalScale} onChange={(e) => setAnimationConfig({...animationConfig, finalScale: parseFloat(e.target.value)})} className="w-full text-xs border border-sc-border p-1 rounded-[2px]" />
                             </div>
                        </div>
                        <div>
                           <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Duration</span><span>{animationConfig.duration}s</span></div>
                           <input type="range" min="1" max="15" step="1" value={animationConfig.duration} onChange={(e) => setAnimationConfig({...animationConfig, duration: parseFloat(e.target.value)})} />
                        </div>
                        <div>
                           <div className="flex justify-between text-[10px] mb-1 text-sc-subtext"><span>Rotation Speed</span><span>{animationConfig.rotationSpeed}</span></div>
                           <input type="range" min="0" max="5" step="0.1" value={animationConfig.rotationSpeed} onChange={(e) => setAnimationConfig({...animationConfig, rotationSpeed: parseFloat(e.target.value)})} />
                        </div>
                   </div>

               </div>
           </div>
        </section>

      </main>
    </div>
  );
};

// --- Main Page: Dashboard ---

const App: React.FC = () => {
  const [currentTool, setCurrentTool] = useState<'home' | 'nebula-weaver' | 'photo-framer'>('home');

  if (currentTool === 'nebula-weaver') {
    return <NebulaTool onBack={() => setCurrentTool('home')} />;
  }

  if (currentTool === 'photo-framer') {
    return <PhotoFramerTool onBack={() => setCurrentTool('home')} />;
  }

  return (
    <div className="min-h-screen bg-sc-gray font-sans flex flex-col">
      {/* Landing Header */}
      <header className="bg-sc-dark text-white py-12 text-center border-b-4 border-sc-primary">
         <div className="max-w-4xl mx-auto px-4">
             <div className="mb-6 flex justify-center">
                 <div className="bg-sc-primary p-4 rounded-[3px] shadow-lg">
                    <RocketLaunchIcon className="w-10 h-10 text-white" />
                 </div>
             </div>
             <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-4">STELLAR STUDIO</h1>
             <p className="text-gray-400 text-lg max-w-2xl mx-auto">High-performance creative tools for astrophotography visualization.</p>
         </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 w-full">
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Nebula Tool Card */}
            <div 
              onClick={() => setCurrentTool('nebula-weaver')}
              className="bg-white border border-sc-border hover:border-sc-primary rounded-[3px] p-6 cursor-pointer transition-all hover:shadow-sc-hover group h-64 flex flex-col justify-between"
            >
               <div>
                  <h2 className="text-xl font-bold text-sc-text mb-2 group-hover:text-sc-primary transition-colors">Nebula Weaver</h2>
                  <p className="text-sm text-sc-subtext leading-relaxed">
                    Convert 2D astrophotos into 3D space travel animations using parallax star mapping.
                  </p>
               </div>
               <div className="flex items-center justify-between mt-4">
                   <div className="flex items-center gap-1">
                      <SparklesIcon className="w-4 h-4 text-sc-primary" />
                      <span className="text-xs font-bold text-sc-subtext">v2.1</span>
                   </div>
                   <button className="bg-sc-primary text-white text-xs font-bold px-4 py-2 rounded-[3px]">Launch</button>
               </div>
            </div>

            {/* Photo Framer Card */}
            <div 
              onClick={() => setCurrentTool('photo-framer')}
              className="bg-white border border-sc-border hover:border-sc-primary rounded-[3px] p-6 cursor-pointer transition-all hover:shadow-sc-hover group h-64 flex flex-col justify-between"
            >
               <div>
                  <h2 className="text-xl font-bold text-sc-text mb-2 group-hover:text-sc-primary transition-colors">Photo Framer</h2>
                  <p className="text-sm text-sc-subtext leading-relaxed">
                    Create glassmorphism-style framed photos with blurred backgrounds. Batch processing supported.
                  </p>
               </div>
               <div className="flex items-center justify-between mt-4">
                   <div className="flex items-center gap-1">
                      <PhotoIcon className="w-4 h-4 text-sc-primary" />
                      <span className="text-xs font-bold text-sc-subtext">v1.0</span>
                   </div>
                   <button className="bg-sc-primary text-white text-xs font-bold px-4 py-2 rounded-[3px]">Launch</button>
               </div>
            </div>

            {/* Placeholder */}
            <div className="bg-gray-100 border border-transparent rounded-[3px] p-6 h-64 flex flex-col justify-between opacity-70">
                <div>
                   <h2 className="text-xl font-bold text-gray-400 mb-2">Star Field Gen</h2>
                   <p className="text-sm text-gray-400 leading-relaxed">
                     Procedural star generation for background assets.
                   </p>
                </div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Coming Soon</span>
            </div>

         </div>
      </main>
      
      <footer className="bg-white border-t border-sc-border py-8 text-center text-xs text-sc-subtext">
         © 2024 Stellar Studio. Designed for creators.
      </footer>
    </div>
  );
};

export default App;
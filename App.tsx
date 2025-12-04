
import React, { useState, useCallback } from 'react';
import { ParticleConfig, AnimationConfig, NebulaData, VideoConfig, Particle, ExportFormat } from './types';
import NebulaCanvas from './components/NebulaCanvas';
import { analyzeNebulaImage, identifyNebulaFromImage } from './services/geminiService';
import { detectStarsFromImage } from './services/starDetectionService';
import { 
  SparklesIcon, 
  FilmIcon, 
  ArrowPathIcon, 
  CloudArrowUpIcon,
  PlayIcon,
  Cog6ToothIcon,
  AdjustmentsHorizontalIcon,
  VideoCameraIcon
} from '@heroicons/react/24/solid';

const App: React.FC = () => {
  // Data State
  const [nebulaData, setNebulaData] = useState<NebulaData>({
    name: '',
    imageBase64: null,
  });
  
  const [isIdentifying, setIsIdentifying] = useState(false);

  // UI State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0); // 0-100
  const [analysisStep, setAnalysisStep] = useState('');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [previewTrigger, setPreviewTrigger] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState<'none' | 'success' | 'error'>('none');
  
  // Star Detection State
  const [detectedParticles, setDetectedParticles] = useState<Particle[] | null>(null);
  const [detectionMode, setDetectionMode] = useState<'real' | 'ai-map' | 'procedural'>('procedural');

  // Configuration State
  const [particleConfig, setParticleConfig] = useState<ParticleConfig>({
    density: 150,
    baseSize: 1.0,
    brightness: 1.0, 
    color: '#ffffff',
    feathering: 1.0, 
  });

  const [animationConfig, setAnimationConfig] = useState<AnimationConfig>({
    initialScale: 1.0,
    finalScale: 1.5,
    rotationDirection: 'cw',
    rotationSpeed: 0.5,
    duration: 5,
    zoomOrigin: { x: 0.5, y: 0.5 }
  });

  const [videoConfig, setVideoConfig] = useState<VideoConfig>({
    resolution: '1080p',
    bitrate: 5, 
    format: 'mp4'
  });

  // Handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setNebulaData(prev => ({ ...prev, imageBase64: base64, identifiedName: undefined }));
        setAnalysisStatus('none');
        setDetectedParticles(null);
        setDetectionMode('procedural');
        
        // Auto-Identify
        setIsIdentifying(true);
        const name = await identifyNebulaFromImage(base64);
        setNebulaData(prev => ({ ...prev, identifiedName: name }));
        setIsIdentifying(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalysis = async () => {
    if (!nebulaData.imageBase64) {
      alert("Please upload an image.");
      return;
    }
    
    const nameToUse = nebulaData.name || nebulaData.identifiedName || "Unknown Nebula";
    
    setIsAnalyzing(true);
    setAnalysisStatus('none');
    setAnalysisProgress(0);
    setDetectedParticles(null);
    
    try {
      setAnalysisStep('Analyzing Image & Star Map...');
      setAnalysisProgress(20);

      // Run Image Analysis (SXT) and Gemini AI Analysis in parallel
      const [analysisResult, imageStars] = await Promise.all([
        analyzeNebulaImage(nebulaData.imageBase64, nameToUse),
        detectStarsFromImage(nebulaData.imageBase64)
      ]);
      
      setAnalysisProgress(80);
      setNebulaData(prev => ({ ...prev, analysis: analysisResult }));
      
      // --- Prioritization Logic ---
      
      // 1. Image Detected Stars (SXT)
      if (imageStars.length > 50) {
        setDetectedParticles(imageStars);
        setDetectionMode('real');
        console.log("Using Image Detected Stars");
      } 
      // 2. AI Star Map (Fallback if image is too blurry/dark/processed)
      else if (analysisResult.starHotspots && analysisResult.starHotspots.length > 0) {
        // AI returns sparse hotspots (5-10 points). We need to generate clusters around them.
        const aiParticles: Particle[] = [];
        const CLUSTER_SIZE = 50; // Stars per hotspot
        
        analysisResult.starHotspots.forEach(spot => {
          for(let i=0; i<CLUSTER_SIZE; i++) {
             // Gaussian distribution around hotspot
             const offsetX = (Math.random() - 0.5) * 0.15; 
             const offsetY = (Math.random() - 0.5) * 0.15;
             const x = (spot.x / 100) + offsetX;
             const y = (spot.y / 100) + offsetY;
             
             if(x >=0 && x<=1 && y>=0 && y<=1) {
                aiParticles.push({
                  x, y,
                  z: Math.pow(Math.random(), 3) * 5.0,
                  scale: 0.5 + Math.random(),
                  color: analysisResult.dominantColors?.[0] || '#ffffff'
                });
             }
          }
        });
        
        setDetectedParticles(aiParticles);
        setDetectionMode('ai-map');
        console.log("Using AI Map Hotspots");
      } 
      // 3. Procedural (Random)
      else {
        setDetectedParticles(null);
        setDetectionMode('procedural');
        console.log("Fallback to Procedural");
      }

      setAnalysisStatus('success');
      setAnalysisProgress(100);
      setPreviewTrigger(t => t + 1);
    } catch (e) {
      console.error(e);
      setAnalysisStatus('error');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const handleApplyAiName = () => {
    if (nebulaData.identifiedName) {
      setNebulaData(prev => ({ ...prev, name: nebulaData.identifiedName! }));
    }
  };

  const handleGenerateVideo = () => {
    if (!nebulaData.imageBase64) return;
    setIsGenerating(true);
    setVideoUrl(null);
  };

  const handleRecordingComplete = (url: string) => {
    setIsGenerating(false);
    setVideoUrl(url);
  };

  const handleSetZoomOrigin = (x: number, y: number) => {
    setAnimationConfig(prev => ({ ...prev, zoomOrigin: { x, y } }));
  };

  return (
    <div className="min-h-screen bg-space-900 text-white p-4 md:p-6 lg:p-8">
      <header className="max-w-7xl mx-auto mb-6 md:mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-space-accent to-purple-600 flex items-center justify-center shadow-lg shadow-space-accent/20 flex-shrink-0">
            <SparklesIcon className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center md:text-left">Nebula Weaver</h1>
        </div>
        <div className="text-xs text-space-highlight bg-space-800 px-3 py-1 rounded-full border border-space-700 whitespace-nowrap">
          Powered by Gemini 2.5
        </div>
      </header>

      {/* Grid Layout */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Section 1: Upload & Identify */}
        <section className="lg:col-span-4 bg-space-800/50 border border-space-700 rounded-xl p-5 md:p-6 backdrop-blur-md h-fit">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CloudArrowUpIcon className="w-5 h-5 text-space-accent" />
            Source Material
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nebula Image</label>
              <input 
                type="file" 
                accept="image/*"
                onChange={handleImageUpload}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-space-700 file:text-white hover:file:bg-space-600 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Nebula Name</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={nebulaData.name}
                  onChange={(e) => setNebulaData(prev => ({...prev, name: e.target.value}))}
                  placeholder={isIdentifying ? "Identifying..." : (nebulaData.identifiedName || "e.g. Orion Nebula")}
                  className="w-full bg-space-900 border border-space-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-space-accent placeholder-gray-600"
                />
              </div>
              
              {nebulaData.identifiedName && (
                <div className="flex items-center justify-between mt-2 bg-space-900/50 p-2 rounded border border-space-700/50">
                   <p className="text-[10px] text-gray-400">
                      AI Suggests: <span className="text-space-highlight font-mono">{nebulaData.identifiedName}</span>
                   </p>
                   <button 
                     onClick={handleApplyAiName}
                     className="text-[10px] bg-space-700 hover:bg-space-600 px-2 py-1 rounded text-white transition-colors"
                   >
                     Apply
                   </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button 
                onClick={handleAnalysis}
                disabled={isAnalyzing || !nebulaData.imageBase64}
                className={`w-full py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                  isAnalyzing 
                    ? 'bg-space-700 cursor-not-allowed text-gray-400' 
                    : 'bg-space-accent hover:bg-indigo-500 text-white shadow-lg shadow-space-accent/25'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin" /> Analyzing...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-5 h-5" /> Identify & Analyze
                  </>
                )}
              </button>

              {/* Progress Bar */}
              {isAnalyzing && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{analysisStep}</span>
                    <span>{analysisProgress}%</span>
                  </div>
                  <div className="w-full bg-space-900 rounded-full h-1.5 overflow-hidden border border-space-700">
                    <div 
                      className="bg-space-accent h-full transition-all duration-300 ease-out rounded-full"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            
            {analysisStatus === 'success' && !isAnalyzing && (
              <div className="p-3 bg-green-900/20 border border-green-700/50 rounded text-green-400 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span>✓</span> Analysis complete!
                </div>
                <div className="text-xs text-green-300 opacity-80">
                  {detectionMode === 'real' && `Using ${detectedParticles?.length} stars detected from image.`}
                  {detectionMode === 'ai-map' && `Using AI Star Map data (Fallback).`}
                  {detectionMode === 'procedural' && `Using random star field (Low signal detected).`}
                </div>
              </div>
            )}
            {analysisStatus === 'error' && (
              <div className="p-3 bg-red-900/20 border border-red-700/50 rounded text-red-400 text-sm">
                Analysis failed. Please try again.
              </div>
            )}

            {nebulaData.analysis && (
              <div className="mt-2 p-3 bg-space-900/50 rounded border border-space-700 text-sm text-gray-300 italic">
                "{nebulaData.analysis.description}"
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Canvas & Output */}
        <div className="lg:col-span-8 lg:row-span-2 flex flex-col gap-6">
           <div className="bg-space-800/50 border border-space-700 rounded-xl p-1 backdrop-blur-md shadow-2xl relative group">
             <NebulaCanvas 
                imageBase64={nebulaData.imageBase64}
                particleConfig={particleConfig}
                animationConfig={animationConfig}
                videoConfig={videoConfig}
                analysis={nebulaData.analysis}
                detectedParticles={detectedParticles}
                isRecording={isGenerating}
                onRecordingComplete={handleRecordingComplete}
                triggerPreview={previewTrigger}
                onSetZoomOrigin={handleSetZoomOrigin}
             />
             
             {isGenerating && (
                <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm rounded-lg">
                   <div className="w-16 h-16 border-4 border-space-700 border-t-space-accent rounded-full animate-spin mb-4" />
                   <h3 className="text-xl font-bold text-white">Rendering Video...</h3>
                   <p className="text-gray-400">Resolution: {videoConfig.resolution} • {videoConfig.format.toUpperCase()}</p>
                </div>
             )}
          </div>

          <div className="flex gap-4">
             <button 
                onClick={handleGenerateVideo}
                disabled={isGenerating || !nebulaData.imageBase64}
                className={`flex-1 py-3 md:py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 md:gap-3 transition-all ${
                  !nebulaData.imageBase64
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-space-accent to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white shadow-lg shadow-purple-900/50 hover:shadow-purple-900/80 transform hover:-translate-y-1 active:translate-y-0'
                }`}
             >
                <FilmIcon className="w-5 h-5 md:w-6 md:h-6" />
                {isGenerating ? 'Processing...' : `Export ${videoConfig.format.toUpperCase()}`}
             </button>
          </div>

          {videoUrl && (
            <div className="animate-fade-in-up bg-space-800/50 border border-space-700 rounded-xl p-4 md:p-6">
              <h3 className="text-lg font-bold mb-4 text-green-400 flex items-center gap-2">
                 <span>✓</span> Generation Complete
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                 <video src={videoUrl} controls className="w-full rounded-lg shadow-lg border border-space-700 bg-black" />
                 <div className="space-y-4">
                    <p className="text-gray-300 text-sm">
                      Your nebula animation is ready.
                    </p>
                    <a 
                      href={videoUrl} 
                      download={`${nebulaData.name || 'nebula'}-animation.${videoConfig.format}`}
                      className="block w-full text-center py-2 bg-space-700 hover:bg-space-600 text-white rounded-lg border border-space-600 transition-colors"
                    >
                      Download Video (.{videoConfig.format})
                    </a>
                    <button 
                       onClick={() => setVideoUrl(null)}
                       className="block w-full text-center text-sm text-gray-500 hover:text-white"
                    >
                       Dismiss
                    </button>
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Configuration */}
        <section className="lg:col-span-4 bg-space-800/50 border border-space-700 rounded-xl p-5 md:p-6 backdrop-blur-md h-fit">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Cog6ToothIcon className="w-5 h-5 text-space-accent" />
            Effect Configuration
          </h2>

          <div className="space-y-6">
            
            {/* Video Quality Settings */}
            <div className="space-y-3">
               <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <VideoCameraIcon className="w-4 h-4" />
                Video Output
              </h3>
              
              <div className="bg-space-900/50 p-3 rounded-lg border border-space-700/50 space-y-4">
                <div>
                   <label className="block text-xs text-gray-400 mb-1">Resolution</label>
                   <select 
                      value={videoConfig.resolution}
                      onChange={(e) => setVideoConfig({...videoConfig, resolution: e.target.value as any})}
                      className="w-full bg-space-900 border border-space-700 rounded p-2 text-sm text-gray-200"
                   >
                      <option value="original">Original Image Size</option>
                      <option value="1080p">1080p (Scaled)</option>
                      <option value="4k">4K (Scaled)</option>
                   </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Format</label>
                     <select 
                        value={videoConfig.format}
                        onChange={(e) => setVideoConfig({...videoConfig, format: e.target.value as ExportFormat})}
                        className="w-full bg-space-900 border border-space-700 rounded p-2 text-sm text-gray-200"
                     >
                        <option value="mp4">MP4</option>
                        <option value="webm">WebM</option>
                        <option value="mkv">MKV</option>
                        <option value="mov">MOV</option>
                     </select>
                  </div>
                   <div>
                    <label className="block text-xs text-gray-400 mb-1">Bitrate</label>
                     <div className="text-xs text-space-highlight mb-1 text-right">{videoConfig.bitrate} Mbps</div>
                  </div>
                </div>

                <div>
                  <input 
                    type="range" min="1" max="50" step="1"
                    value={videoConfig.bitrate}
                    onChange={(e) => setVideoConfig({...videoConfig, bitrate: parseFloat(e.target.value)})}
                    className="w-full accent-space-accent touch-pan-x"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Bitrate applies to export only</p>
                </div>
              </div>
            </div>
            
            <div className="h-px bg-space-700/50" />

            {/* Particle Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <AdjustmentsHorizontalIcon className="w-4 h-4" />
                  Particle Effects
                </h3>
                {detectionMode !== 'procedural' && (
                  <span className="text-[10px] bg-indigo-900/50 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded uppercase">
                    {detectionMode === 'real' ? 'SXT Mapped' : 'AI Mapped'}
                  </span>
                )}
              </div>
              
              <div className="bg-space-900/50 p-3 rounded-lg border border-space-700/50 space-y-4">
                
                <div className={detectionMode !== 'procedural' ? 'opacity-50 pointer-events-none' : ''}>
                  <label className="flex justify-between text-sm mb-1">
                    <span>Density</span>
                    <span className="text-space-highlight">{particleConfig.density}</span>
                  </label>
                  <input 
                    type="range" min="0" max="500" step="10"
                    value={particleConfig.density}
                    onChange={(e) => setParticleConfig({...particleConfig, density: parseFloat(e.target.value)})}
                    className="w-full accent-space-accent touch-pan-x"
                  />
                </div>

                <div>
                  <label className="flex justify-between text-sm mb-1">
                    <span>Brightness</span>
                    <span className="text-space-highlight">{Math.round(particleConfig.brightness * 100)}%</span>
                  </label>
                  <input 
                    type="range" min="0" max="3" step="0.1"
                    value={particleConfig.brightness}
                    onChange={(e) => setParticleConfig({...particleConfig, brightness: parseFloat(e.target.value)})}
                    className="w-full accent-space-accent touch-pan-x"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                     <span>Off</span>
                     <span>Overexpose (300%)</span>
                  </div>
                </div>

                <div>
                  <label className="flex justify-between text-sm mb-1">
                    <span>Size</span>
                    <span className="text-space-highlight">{particleConfig.baseSize.toFixed(2)}x</span>
                  </label>
                  <input 
                    type="range" min="0" max="2" step="0.01"
                    value={particleConfig.baseSize}
                    onChange={(e) => setParticleConfig({...particleConfig, baseSize: parseFloat(e.target.value)})}
                    className="w-full accent-space-accent touch-pan-x"
                  />
                </div>
                
                <div>
                  <label className="flex justify-between text-sm mb-1">
                    <span>Glow / Feathering Gain</span>
                    <span className="text-space-highlight">{particleConfig.feathering.toFixed(1)}x</span>
                  </label>
                  <input 
                    type="range" min="-3" max="3" step="0.1"
                    value={particleConfig.feathering}
                    onChange={(e) => setParticleConfig({...particleConfig, feathering: parseFloat(e.target.value)})}
                    className="w-full accent-space-accent touch-pan-x"
                  />
                   <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                     <span>Sharpen/Contract</span>
                     <span>Default</span>
                     <span>Glow/Expand</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-1 text-gray-400">Particle Color</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={particleConfig.color}
                      onChange={(e) => setParticleConfig({...particleConfig, color: e.target.value})}
                      className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                    />
                    <span className="text-xs text-gray-500 uppercase">{particleConfig.color}</span>
                  </div>
                </div>

              </div>
            </div>

            <div className="h-px bg-space-700/50" />

            {/* Animation Settings */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Movement</h3>
              
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs text-gray-400 mb-1">Rotate Dir</label>
                    <select 
                      value={animationConfig.rotationDirection}
                      onChange={(e) => setAnimationConfig({...animationConfig, rotationDirection: e.target.value as 'cw'|'ccw'})}
                      className="w-full bg-space-900 border border-space-700 rounded p-2 text-sm text-gray-200"
                    >
                      <option value="cw">Clockwise</option>
                      <option value="ccw">Counter-CW</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs text-gray-400 mb-1">Rotation Speed</label>
                    <input 
                    type="range" min="0" max="5" step="0.1"
                    value={animationConfig.rotationSpeed}
                    onChange={(e) => setAnimationConfig({...animationConfig, rotationSpeed: parseFloat(e.target.value)})}
                    className="w-full accent-space-accent touch-pan-x h-8"
                  />
                 </div>
              </div>

              <div>
                <label className="flex justify-between text-sm mb-1">
                  <span>Initial Scale</span>
                  <span className="text-space-highlight">{animationConfig.initialScale.toFixed(1)}x</span>
                </label>
                <input 
                  type="range" min="0.1" max="3" step="0.1"
                  value={animationConfig.initialScale}
                  onChange={(e) => setAnimationConfig({...animationConfig, initialScale: parseFloat(e.target.value)})}
                  className="w-full accent-space-accent touch-pan-x"
                />
              </div>

               <div>
                <label className="flex justify-between text-sm mb-1">
                  <span>Final Scale</span>
                  <span className="text-space-highlight">{animationConfig.finalScale.toFixed(1)}x</span>
                </label>
                <input 
                  type="range" min="0.1" max="3" step="0.1"
                  value={animationConfig.finalScale}
                  onChange={(e) => setAnimationConfig({...animationConfig, finalScale: parseFloat(e.target.value)})}
                  className="w-full accent-space-accent touch-pan-x"
                />
              </div>

               <div>
                <label className="flex justify-between text-sm mb-1">
                  <span>Duration</span>
                  <span className="text-space-highlight">{animationConfig.duration}s</span>
                </label>
                <input 
                  type="range" min="1" max="15" step="1"
                  value={animationConfig.duration}
                  onChange={(e) => setAnimationConfig({...animationConfig, duration: parseFloat(e.target.value)})}
                  className="w-full accent-space-accent touch-pan-x"
                />
              </div>
            </div>

          </div>
        </section>

      </main>
    </div>
  );
};

export default App;

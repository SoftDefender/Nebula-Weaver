
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  ArrowDownTrayIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon,
  CloudArrowUpIcon,
  XMarkIcon,
  TrashIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CpuChipIcon,
  PlusIcon,
  ChevronDownIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/solid';
import { CompressorItem, CompressionSettings, ImageFormat, SizeUnit } from '../types';
import { compressImageToTarget } from '../services/compressorService';

interface PhotoCompressorToolProps {
  onBack: () => void;
}

const PhotoCompressorTool: React.FC<PhotoCompressorToolProps> = ({ onBack }) => {
  const [items, setItems] = useState<CompressorItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [showSidebar, setShowSidebar] = useState(window.innerWidth >= 1024);
  
  const [settings, setSettings] = useState<CompressionSettings>({
    targetSize: 500,
    targetUnit: 'KB',
    outputFormat: 'original',
    preserveMetadata: false,
    maintainAspectRatio: true
  });

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setShowSidebar(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const targetSizeInKB = useMemo(() => {
    switch (settings.targetUnit) {
      case 'MB': return settings.targetSize * 1024;
      case 'GB': return settings.targetSize * 1024 * 1024;
      default: return settings.targetSize;
    }
  }, [settings.targetSize, settings.targetUnit]);

  const handleFiles = (files: FileList) => {
    const newItems: CompressorItem[] = Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
        originalSize: file.size,
        status: 'pending'
      }));
    setItems(prev => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach(i => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
  };

  const startCompression = async () => {
    if (items.length === 0 || isProcessing) return;
    setIsProcessing(true);
    
    // Close sidebar on mobile when starting to focus on results
    if (isMobile) setShowSidebar(false);

    // Create a copy to track updates
    const updatedItems = [...items];
    
    for (let i = 0; i < updatedItems.length; i++) {
      // Logic Fix: Always re-process regardless of previous 'success' status
      // to support parameter changes.
      updatedItems[i] = { 
        ...updatedItems[i], 
        status: 'processing',
        error: undefined 
      };
      setItems([...updatedItems]);

      try {
        const result = await compressImageToTarget(
          updatedItems[i].file,
          targetSizeInKB,
          settings.outputFormat
        );
        updatedItems[i] = {
          ...updatedItems[i],
          status: 'success',
          compressedSize: result.size,
          resultBlob: result
        };
      } catch (err) {
        updatedItems[i] = {
          ...updatedItems[i],
          status: 'error',
          error: "Compression failed"
        };
      }
      setItems([...updatedItems]);
    }
    setIsProcessing(false);
  };

  const downloadAll = () => {
    items.forEach(item => {
      if (item.resultBlob && item.status === 'success') {
        const url = URL.createObjectURL(item.resultBlob);
        const a = document.createElement('a');
        a.href = url;
        const ext = settings.outputFormat === 'original' 
          ? item.file.name.split('.').pop() 
          : settings.outputFormat.split('/')[1];
        a.download = `${item.file.name.split('.')[0]}_optimized.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const totalOriginalSize = items.reduce((acc, i) => acc + i.originalSize, 0);
  const totalCompressedSize = items.reduce((acc, i) => acc + (i.compressedSize || 0), 0);
  const totalSaved = totalOriginalSize - totalCompressedSize;

  const handleSizeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      setSettings({ ...settings, targetSize: val });
    } else if (e.target.value === '') {
      setSettings({ ...settings, targetSize: 0 });
    }
  };

  return (
    <div 
      className="h-screen bg-rv-bg flex flex-col font-sans select-none overflow-hidden"
      onDragOver={(e) => { 
        if (!isMobile) {
          e.preventDefault();
          setIsDragging(true);
        }
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { 
        if (!isMobile) {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        }
      }}
    >
      <header className="h-12 bg-rv-panel border-b border-rv-border flex items-center justify-between px-4 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div onClick={onBack} className="flex items-center gap-2 cursor-pointer group">
            <div className="bg-rv-accent p-1.5 rounded-sm group-hover:bg-rv-accentHover transition-colors">
              <CpuChipIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight text-rv-text uppercase">Photo<span className="font-light text-rv-subtext hidden sm:inline">Shrink</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block text-[10px] font-mono text-rv-subtext uppercase tracking-widest">Core Optimizer</div>
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className="lg:hidden p-1.5 text-rv-subtext hover:text-white bg-rv-surface rounded-sm border border-rv-border"
          >
            <AdjustmentsHorizontalIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Sidebar: Settings (Left on mobile, Right on Desktop) */}
        <aside className={`
          fixed lg:relative inset-y-0 right-0 w-[85vw] sm:w-80 bg-rv-panel border-l border-rv-border flex flex-col shrink-0 z-40 transition-transform duration-300
          ${showSidebar ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}>
          <div className="p-4 border-b border-rv-border bg-rv-surface flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rv-subtext flex items-center gap-2">
              <InformationCircleIcon className="w-4 h-4" /> Parameters
            </span>
            <button onClick={() => setShowSidebar(false)} className="lg:hidden p-1 text-rv-subtext">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
            {/* Target Size Input */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] text-rv-subtext mb-2 uppercase font-black tracking-tighter">
                  <span>Target Limit</span>
                  <span className="text-rv-accent">{settings.targetSize} {settings.targetUnit}</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="number" 
                      value={settings.targetSize} 
                      onChange={handleSizeInput}
                      className="w-full h-11 bg-rv-surface border border-rv-border rounded-sm px-3 text-sm font-mono text-rv-text focus:border-rv-accent outline-none transition-colors"
                      placeholder="Size..."
                    />
                  </div>
                  <div className="relative w-24">
                    <select
                      value={settings.targetUnit}
                      onChange={(e) => setSettings({ ...settings, targetUnit: e.target.value as SizeUnit })}
                      className="w-full h-11 bg-rv-surface border border-rv-border rounded-sm px-2 text-[10px] font-black text-rv-text appearance-none focus:border-rv-accent outline-none cursor-pointer"
                    >
                      <option value="KB">KB</option>
                      <option value="MB">MB</option>
                      <option value="GB">GB</option>
                    </select>
                    <ChevronDownIcon className="w-4 h-4 text-rv-subtext absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div className="mt-5">
                   <input 
                    type="range" 
                    min="1" 
                    max={settings.targetUnit === 'KB' ? 5000 : 1024} 
                    step="1" 
                    value={settings.targetSize} 
                    onChange={(e) => setSettings({...settings, targetSize: parseFloat(e.target.value)})} 
                  />
                  <div className="flex justify-between text-[8px] text-rv-subtext mt-1 font-mono uppercase">
                    <span>min: 1 {settings.targetUnit}</span>
                    <span>max: {settings.targetUnit === 'KB' ? 5000 : 1024} {settings.targetUnit}</span>
                  </div>
                </div>
              </div>

              {/* Export Format */}
              <div>
                <span className="text-[10px] text-rv-subtext mb-2 block uppercase font-black tracking-tighter">Format Override</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Source', value: 'original' },
                    { label: 'JPEG', value: 'image/jpeg' },
                    { label: 'PNG', value: 'image/png' },
                    { label: 'WebP', value: 'image/webp' },
                    { label: 'AVIF', value: 'image/avif' }
                  ].map(fmt => (
                    <button
                      key={fmt.value}
                      onClick={() => setSettings({...settings, outputFormat: fmt.value as any})}
                      className={`h-9 rounded-sm text-[10px] font-black uppercase border transition-all ${settings.outputFormat === fmt.value ? 'bg-rv-accent text-white border-rv-accent shadow-lg shadow-rv-accent/20' : 'bg-rv-surface border-rv-border text-rv-subtext hover:border-rv-text'}`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Session Stats */}
            {items.length > 0 && (
              <div className="pt-6 border-t border-rv-border space-y-4">
                <span className="text-[10px] font-black text-rv-subtext uppercase tracking-widest">Telemetry</span>
                <div className="grid grid-cols-1 gap-2">
                  <div className="p-3 bg-rv-surface border border-rv-border rounded-sm flex justify-between items-center">
                    <div className="text-[9px] font-black text-rv-subtext uppercase">Original</div>
                    <div className="text-xs font-mono text-rv-text">{formatSize(totalOriginalSize)}</div>
                  </div>
                  <div className="p-3 bg-rv-surface border border-rv-border rounded-sm flex justify-between items-center">
                    <div className="text-[9px] font-black text-rv-subtext uppercase">Compressed</div>
                    <div className="text-xs font-mono text-rv-text">{totalCompressedSize > 0 ? formatSize(totalCompressedSize) : '--'}</div>
                  </div>
                </div>
                {totalSaved > 0 && (
                  <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] font-black rounded-sm text-center uppercase tracking-widest">
                    Saved {formatSize(totalSaved)} ({(totalSaved / totalOriginalSize * 100).toFixed(1)}%)
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-rv-surface border-t border-rv-border space-y-2 shrink-0">
            <button 
              onClick={startCompression}
              disabled={items.length === 0 || isProcessing || settings.targetSize <= 0}
              className="w-full h-12 bg-rv-accent hover:bg-rv-accentHover text-white text-[10px] font-black uppercase tracking-widest rounded-sm flex items-center justify-center gap-2 transition-all shadow-xl disabled:opacity-30 disabled:cursor-not-allowed group"
            >
              <ArrowPathIcon className={`w-5 h-5 ${isProcessing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} /> 
              {items.some(i => i.status === 'success') ? 'Re-Process All' : 'Run Compression'}
            </button>
            {totalCompressedSize > 0 && (
              <button 
                onClick={downloadAll}
                className="w-full h-11 bg-rv-text hover:bg-white text-rv-bg text-[10px] font-black uppercase tracking-widest rounded-sm flex items-center justify-center gap-2 transition-all"
              >
                <ArrowDownTrayIcon className="w-5 h-5" /> Save Optimized
              </button>
            )}
          </div>
        </aside>

        {/* Viewport: Image Grid */}
        <section className="flex-1 relative bg-black flex flex-col overflow-hidden">
          <div className="p-4 border-b border-rv-border bg-rv-panel flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <input 
                type="file" id="batch-upload" className="hidden" 
                multiple accept="image/*" onChange={(e) => e.target.files && handleFiles(e.target.files)} 
              />
              <label htmlFor="batch-upload" className="px-5 h-9 bg-rv-surface border border-rv-border hover:border-rv-accent text-rv-text text-[10px] font-black uppercase rounded-sm flex items-center justify-center gap-2 cursor-pointer transition-all">
                <PlusIcon className="w-4 h-4" /> Import Assets
              </label>
            </div>
            {items.length > 0 && (
              <button onClick={clearAll} className="text-[10px] font-black text-rv-subtext hover:text-rv-danger uppercase tracking-widest flex items-center gap-1.5 transition-colors">
                <TrashIcon className="w-4 h-4" /> One-Key Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-6">
                <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center border-2 border-dashed transition-all ${isDragging ? 'bg-rv-accent/10 border-rv-accent scale-110 shadow-[0_0_30px_rgba(59,130,246,0.2)]' : 'border-rv-border'}`}>
                  <CloudArrowUpIcon className={`w-10 h-10 sm:w-12 sm:h-12 ${isDragging ? 'text-rv-accent' : 'text-rv-border'}`} />
                </div>
                <div className="space-y-2 max-w-xs mx-auto">
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest text-rv-text">Drop Assets to Optimize</h3>
                  <p className="text-[9px] sm:text-[10px] text-rv-subtext uppercase leading-relaxed font-bold">Files will be compressed to meet target constraints while preserving visual fidelity</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {items.map((item) => (
                  <div key={item.id} className={`bg-rv-panel border rounded-sm overflow-hidden group transition-all flex flex-col shadow-xl ${item.status === 'success' ? 'border-green-500/30' : 'border-rv-border hover:border-rv-accent'}`}>
                    <div className="aspect-square relative overflow-hidden bg-rv-surface">
                      <img src={item.previewUrl} className="w-full h-full object-cover" alt="" />
                      <div className="absolute top-1 right-1 sm:top-2 sm:right-2">
                        <button onClick={() => removeItem(item.id)} className="p-1.5 bg-black/70 text-white rounded-sm opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rv-danger">
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {/* Status Badges */}
                      {item.status === 'processing' && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                          <ArrowPathIcon className="w-8 h-8 text-rv-accent animate-spin" />
                        </div>
                      )}
                      {item.status === 'success' && (
                        <div className="absolute top-1 left-1 sm:top-2 sm:left-2 p-1 bg-green-500 text-white rounded-sm shadow-xl animate-fade-in">
                          <CheckCircleIcon className="w-4 h-4" />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="absolute top-1 left-1 sm:top-2 sm:left-2 p-1 bg-rv-danger text-white rounded-sm shadow-xl animate-fade-in">
                          <ExclamationCircleIcon className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    
                    <div className="p-3 space-y-2">
                      <div className="text-[10px] font-black truncate text-rv-text uppercase tracking-tight">{item.file.name}</div>
                      <div className="flex justify-between items-center font-mono text-[9px] text-rv-subtext">
                        <span className="opacity-60">{formatSize(item.originalSize)}</span>
                        {item.compressedSize && (
                          <div className="flex items-center gap-1 font-black">
                            <ChevronRightIcon className="w-2.5 h-2.5" />
                            <span className="text-rv-accent">{formatSize(item.compressedSize)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Mobile Sidebar Overlay */}
        {isMobile && showSidebar && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}
      </main>

      {/* Drag Overlay (Disabled on Mobile) */}
      {isDragging && !isMobile && (
        <div className="fixed inset-0 z-[100] bg-rv-accent/10 backdrop-blur-md border-4 border-rv-accent border-dashed flex flex-col items-center justify-center pointer-events-none">
          <CloudArrowUpIcon className="w-24 h-24 text-rv-accent animate-bounce" />
          <span className="text-3xl font-black uppercase tracking-[0.2em] text-rv-accent drop-shadow-lg">Drop to Optimize</span>
          <span className="text-xs font-bold uppercase text-rv-accent mt-4">Release to initialize batch import</span>
        </div>
      )}
    </div>
  );
};

export default PhotoCompressorTool;

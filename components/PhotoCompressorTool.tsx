
import React, { useState, useCallback, useMemo } from 'react';
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
  ChevronDownIcon
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
  
  const [settings, setSettings] = useState<CompressionSettings>({
    targetSize: 500,
    targetUnit: 'KB',
    outputFormat: 'original',
    preserveMetadata: false,
    maintainAspectRatio: true
  });

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

    const updatedItems = [...items];
    for (let i = 0; i < updatedItems.length; i++) {
      if (updatedItems[i].status === 'success') continue;
      
      updatedItems[i].status = 'processing';
      setItems([...updatedItems]);

      try {
        const result = await compressImageToTarget(
          updatedItems[i].file,
          targetSizeInKB,
          settings.outputFormat
        );
        updatedItems[i].status = 'success';
        updatedItems[i].compressedSize = result.size;
        updatedItems[i].resultBlob = result;
      } catch (err) {
        updatedItems[i].status = 'error';
        updatedItems[i].error = "Compression failed";
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
        a.download = `${item.file.name.split('.')[0]}_compressed.${ext}`;
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
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }}
    >
      <header className="h-12 bg-rv-panel border-b border-rv-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <div onClick={onBack} className="flex items-center gap-2 cursor-pointer group">
            <div className="bg-rv-accent p-1.5 rounded-sm group-hover:bg-rv-accentHover transition-colors">
              <CpuChipIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight text-rv-text">PHOTO<span className="font-light text-rv-subtext">SHRINK</span></span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-rv-subtext uppercase tracking-widest">Global Asset Optimizer</div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar: Settings */}
        <aside className="w-80 bg-rv-panel border-r border-rv-border flex flex-col shrink-0">
          <div className="p-5 border-b border-rv-border bg-rv-surface">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rv-subtext flex items-center gap-2">
              <InformationCircleIcon className="w-3.5 h-3.5" /> Optimization Profile
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
            {/* Target Size Input */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] text-rv-subtext mb-2 uppercase font-bold tracking-tighter">
                  <span>Target Size Limit</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="number" 
                      value={settings.targetSize} 
                      onChange={handleSizeInput}
                      className="w-full h-10 bg-rv-surface border border-rv-border rounded-sm px-3 text-xs font-mono text-rv-text focus:border-rv-accent outline-none transition-colors"
                      placeholder="Enter size..."
                    />
                  </div>
                  <div className="relative w-20">
                    <select
                      value={settings.targetUnit}
                      onChange={(e) => setSettings({ ...settings, targetUnit: e.target.value as SizeUnit })}
                      className="w-full h-10 bg-rv-surface border border-rv-border rounded-sm px-2 text-[10px] font-bold text-rv-text appearance-none focus:border-rv-accent outline-none cursor-pointer"
                    >
                      <option value="KB">KB</option>
                      <option value="MB">MB</option>
                      <option value="GB">GB</option>
                    </select>
                    <ChevronDownIcon className="w-3 h-3 text-rv-subtext absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div className="mt-4">
                   <input 
                    type="range" 
                    min="1" 
                    max={settings.targetUnit === 'KB' ? 5000 : 1024} 
                    step="1" 
                    value={settings.targetSize} 
                    onChange={(e) => setSettings({...settings, targetSize: parseFloat(e.target.value)})} 
                  />
                  <div className="flex justify-between text-[8px] text-rv-subtext mt-1 font-mono">
                    <span>MIN: 1 {settings.targetUnit}</span>
                    <span>MAX: {settings.targetUnit === 'KB' ? 5000 : 1024} {settings.targetUnit}</span>
                  </div>
                </div>
              </div>

              {/* Export Format */}
              <div>
                <span className="text-[10px] text-rv-subtext mb-2 block uppercase font-bold tracking-tighter">Export Format</span>
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
                      className={`h-8 rounded-sm text-[10px] font-bold uppercase border transition-all ${settings.outputFormat === fmt.value ? 'bg-rv-accent text-white border-rv-accent' : 'bg-rv-surface border-rv-border text-rv-subtext hover:border-rv-text'}`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Session Stats */}
            {items.length > 0 && (
              <div className="pt-6 border-t border-rv-border space-y-3">
                <span className="text-[10px] font-bold text-rv-subtext uppercase tracking-widest">Session Telemetry</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-rv-surface border border-rv-border rounded-sm">
                    <div className="text-[8px] font-bold text-rv-subtext uppercase">Original Payload</div>
                    <div className="text-xs font-mono text-rv-text">{formatSize(totalOriginalSize)}</div>
                  </div>
                  <div className="p-3 bg-rv-surface border border-rv-border rounded-sm">
                    <div className="text-[8px] font-bold text-rv-subtext uppercase">Optimized Payload</div>
                    <div className="text-xs font-mono text-rv-text">{totalCompressedSize > 0 ? formatSize(totalCompressedSize) : '--'}</div>
                  </div>
                </div>
                {totalSaved > 0 && (
                  <div className="p-2 bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] font-bold rounded-sm text-center uppercase tracking-widest animate-pulse">
                    Reduction: {formatSize(totalSaved)} ({(totalSaved / totalOriginalSize * 100).toFixed(1)}%)
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-rv-surface border-t border-rv-border space-y-2">
            <button 
              onClick={startCompression}
              disabled={items.length === 0 || isProcessing || settings.targetSize <= 0}
              className="w-full h-10 bg-rv-accent hover:bg-rv-accentHover text-white text-[10px] font-black uppercase tracking-widest rounded-sm flex items-center justify-center gap-2 transition-all shadow-xl disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowPathIcon className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} /> Initialize Compression
            </button>
            {totalCompressedSize > 0 && (
              <button 
                onClick={downloadAll}
                className="w-full h-10 bg-rv-text hover:bg-white text-rv-bg text-[10px] font-black uppercase tracking-widest rounded-sm flex items-center justify-center gap-2 transition-all shadow-xl"
              >
                <ArrowDownTrayIcon className="w-4 h-4" /> Batch Download
              </button>
            )}
          </div>
        </aside>

        {/* Viewport: Image Grid */}
        <section className="flex-1 relative bg-black flex flex-col">
          <div className="p-4 border-b border-rv-border bg-rv-panel flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input 
                type="file" id="batch-upload" className="hidden" 
                multiple accept="image/*" onChange={(e) => e.target.files && handleFiles(e.target.files)} 
              />
              <label htmlFor="batch-upload" className="px-4 h-8 bg-rv-surface border border-rv-border hover:border-rv-accent text-rv-text text-[10px] font-bold uppercase rounded-sm flex items-center justify-center gap-2 cursor-pointer transition-all">
                <PlusIcon className="w-3.5 h-3.5" /> Add Images
              </label>
            </div>
            {items.length > 0 && (
              <button onClick={clearAll} className="text-[10px] font-bold text-rv-subtext hover:text-rv-danger uppercase tracking-widest flex items-center gap-1">
                <TrashIcon className="w-3 h-3" /> Clear Queue
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center border-2 border-dashed transition-all ${isDragging ? 'bg-rv-accent/10 border-rv-accent scale-110' : 'border-rv-border'}`}>
                  <CloudArrowUpIcon className={`w-10 h-10 ${isDragging ? 'text-rv-accent' : 'text-rv-border'}`} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-rv-text">Drop Assets Here</h3>
                  <p className="text-[10px] text-rv-subtext uppercase leading-relaxed">Files will be intelligently re-mapped to target size constraints</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="bg-rv-panel border border-rv-border rounded-sm overflow-hidden group hover:border-rv-accent transition-all flex flex-col shadow-lg">
                    <div className="aspect-square relative overflow-hidden bg-rv-surface">
                      <img src={item.previewUrl} className="w-full h-full object-cover" alt="" />
                      <div className="absolute top-2 right-2">
                        <button onClick={() => removeItem(item.id)} className="p-1.5 bg-black/60 text-white rounded-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rv-danger">
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                      {item.status === 'processing' && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                          <ArrowPathIcon className="w-8 h-8 text-rv-accent animate-spin" />
                        </div>
                      )}
                      {item.status === 'success' && (
                        <div className="absolute top-2 left-2 p-1 bg-green-500 text-white rounded-sm shadow-lg">
                          <CheckCircleIcon className="w-4 h-4" />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="absolute top-2 left-2 p-1 bg-rv-danger text-white rounded-sm shadow-lg">
                          <ExclamationCircleIcon className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="text-[10px] font-bold truncate text-rv-text uppercase">{item.file.name}</div>
                      <div className="flex justify-between items-center font-mono text-[9px] text-rv-subtext">
                        <span>{formatSize(item.originalSize)}</span>
                        {item.compressedSize && (
                          <>
                            <ChevronRightIcon className="w-2 h-2" />
                            <span className="text-rv-accent">{formatSize(item.compressedSize)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-rv-accent/10 backdrop-blur-sm border-4 border-rv-accent border-dashed flex flex-col items-center justify-center pointer-events-none">
          <CloudArrowUpIcon className="w-24 h-24 text-rv-accent animate-bounce" />
          <span className="text-2xl font-black uppercase tracking-widest text-rv-accent">Drop to Optimize</span>
        </div>
      )}
    </div>
  );
};

export default PhotoCompressorTool;

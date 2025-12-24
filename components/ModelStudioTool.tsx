
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  CubeIcon, 
  ArrowPathIcon, 
  TrashIcon, 
  FolderIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ArrowDownTrayIcon,
  SparklesIcon,
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon,
  CloudArrowUpIcon,
  AdjustmentsVerticalIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
  PlusIcon,
  ListBulletIcon,
  ArrowsPointingOutIcon,
  Square3Stack3DIcon,
  Square2StackIcon,
  ArrowsUpDownIcon,
  LinkIcon,
  LinkSlashIcon,
  ComputerDesktopIcon,
  BeakerIcon,
  SunIcon,
  ArrowsPointingInIcon
} from '@heroicons/react/24/solid';
import { ModelStudioItem, ViewerConfig, ModelFormat, ModelNode, ActionType, ModelLayerProperties } from '../types';
import ModelViewer3D from './ModelViewer3D';
import { load3DModel, analyzeModel, buildSceneTree, exportToGLB, autoCenterModel, normalizeModelScale } from '../services/threeService';
import * as THREE from 'three';

interface ModelStudioToolProps {
  onBack: () => void;
}

const PRIMITIVES = [
  { name: 'Cube', type: 'cube' },
  { name: 'Sphere', type: 'sphere' },
  { name: 'Cylinder', type: 'cylinder' },
  { name: 'Torus', type: 'torus' },
  { name: 'Plane', type: 'plane' },
  { name: 'Cone', type: 'cone' },
  { name: 'Icosa', type: 'icosahedron' },
  { name: 'Knot', type: 'torusknot' },
  { name: 'Ring', type: 'ring' },
];

const ModelStudioTool: React.FC<ModelStudioToolProps> = ({ onBack }) => {
  const [layers, setLayers] = useState<ModelStudioItem[]>([]);
  const [layerObjects] = useState<Map<string, THREE.Group>>(new Map());
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Import Flow Modal State
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [showImportPrompt, setShowImportPrompt] = useState(false);

  const [viewerConfig, setViewerConfig] = useState<ViewerConfig>({
    showGrid: true,
    showAxes: true,
    exposure: 1.0,
    environment: 'neutral',
    autoRotate: false,
    wireframe: false,
    isProMode: false,
    showNormals: false
  });

  const activeLayer = useMemo(() => layers[activeIndex] || null, [layers, activeIndex]);

  // Actions
  const handleImportRequest = (files: FileList) => {
    setPendingFiles(files);
    if (layers.length > 0) {
      setShowImportPrompt(true);
    } else {
      processImport(files, 'new');
    }
  };

  const processImport = async (files: FileList | null, mode: 'new' | 'append') => {
    if (!files) return;
    setIsProcessing(true);
    setShowImportPrompt(false);

    if (mode === 'new') {
      // Clear existing session
      layers.forEach(l => {
        const obj = layerObjects.get(l.id);
        if (obj) {
          obj.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).geometry.dispose();
              if (Array.isArray((child as THREE.Mesh).material)) {
                ((child as THREE.Mesh).material as THREE.Material[]).forEach(m => m.dispose());
              } else {
                ((child as THREE.Mesh).material as THREE.Material).dispose();
              }
            }
          });
        }
        URL.revokeObjectURL(l.url);
      });
      layerObjects.clear();
      setLayers([]);
      setActiveIndex(-1);
    }

    const newItems: ModelStudioItem[] = Array.from(files).map((file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() as ModelFormat;
      return {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        file: file,
        url: URL.createObjectURL(file),
        format: ext,
        status: 'pending',
        properties: createDefaultProperties()
      };
    });

    const updatedLayers = mode === 'new' ? [...newItems] : [...layers, ...newItems];
    setLayers(updatedLayers);
    
    // Load each new item
    for (const item of newItems) {
      await loadLayer(item);
    }

    setPendingFiles(null);
    setIsProcessing(false);
  };

  const createDefaultProperties = (): ModelLayerProperties => ({
    color: '#3b82f6',
    opacity: 1.0,
    scale: { x: 1, y: 1, z: 1 },
    position: { x: 0, y: 0, z: 0 },
    visible: true
  });

  const loadLayer = async (item: ModelStudioItem) => {
    try {
      const group = await load3DModel(item.url, item.format);
      const analysis = analyzeModel(group);
      const tree = buildSceneTree(group);

      layerObjects.set(item.id, group);
      
      setLayers(prev => prev.map(l => l.id === item.id ? { 
        ...l, 
        status: 'success', 
        analysis, 
        sceneTree: tree 
      } : l));
      
      setActiveIndex(prev => prev === -1 ? 0 : prev);
    } catch (err) {
      console.error("Load failed", err);
      setLayers(prev => prev.map(l => l.id === item.id ? { ...l, status: 'error' } : l));
    }
  };

  const generatePrimitive = async (type: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newItem: ModelStudioItem = {
      id,
      name: `Primitive: ${type}`,
      url: type,
      format: 'primitive',
      status: 'pending',
      properties: createDefaultProperties()
    };
    
    setLayers(prev => [...prev, newItem]);
    await loadLayer(newItem);
    setActiveIndex(layers.length);
  };

  const updateLayerProperty = (id: string, updates: Partial<ModelLayerProperties>) => {
    setLayers(prev => prev.map(l => l.id === id ? {
      ...l,
      properties: { ...l.properties, ...updates }
    } : l));
  };

  const moveLayer = (id: string, dir: 'up' | 'down') => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    const newLayers = [...layers];
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= layers.length) return;
    
    [newLayers[idx], newLayers[targetIdx]] = [newLayers[targetIdx], newLayers[idx]];
    setLayers(newLayers);
    setActiveIndex(targetIdx);
  };

  const deleteLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    layerObjects.delete(id);
    if (activeIndex >= layers.length - 1) setActiveIndex(layers.length - 2);
  };

  const toggleVisibility = (id: string) => {
    const layer = layers.find(l => l.id === id);
    if (layer) updateLayerProperty(id, { visible: !layer.properties.visible });
  };

  const handleExport = async () => {
    if (layers.length === 0) return;
    setIsProcessing(true);
    try {
      // For export, we combine everything into a single group if multiple layers
      const exportGroup = new THREE.Group();
      layers.forEach(l => {
        const obj = layerObjects.get(l.id);
        if (obj && l.status === 'success') {
          const clone = obj.clone();
          exportGroup.add(clone);
        }
      });
      const blob = await exportToGLB(exportGroup);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stellar_studio_composition.glb`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className={`h-screen bg-rv-bg flex flex-col select-none ${viewerConfig.isProMode ? 'pro-mode' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) handleImportRequest(e.dataTransfer.files); }}
    >
      {/* Header */}
      <header className="h-12 bg-rv-panel border-b border-rv-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <div onClick={onBack} className="flex items-center gap-2 cursor-pointer group">
            <div className="bg-rv-accent p-1.5 rounded-sm group-hover:bg-rv-accentHover transition-colors">
              <CubeIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight text-rv-text">STELLAR<span className="font-light text-rv-subtext">VIEWER</span></span>
          </div>
          <div className="h-4 w-px bg-rv-border"></div>
          <button 
            onClick={() => setViewerConfig(prev => ({ ...prev, isProMode: !prev.isProMode }))}
            className={`px-3 h-6 rounded-full text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${viewerConfig.isProMode ? 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-rv-surface text-rv-subtext border border-rv-border hover:text-rv-text'}`}
          >
            <BeakerIcon className="w-3 h-3" /> {viewerConfig.isProMode ? 'PRO UNLOCKED' : 'GO PRO'}
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHelp(true)} className="text-rv-subtext hover:text-rv-text transition-colors">
            <QuestionMarkCircleIcon className="w-5 h-5" />
          </button>
          <div className="h-4 w-px bg-rv-border"></div>
          <div className="text-[10px] font-mono text-rv-subtext uppercase tracking-widest">Active Layers: {layers.length}</div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar: Layers & Primitives */}
        <aside className="w-64 bg-rv-panel border-r border-rv-border flex flex-col shrink-0">
          
          {/* Layer Stack */}
          <div className="flex flex-col h-2/3 overflow-hidden border-b border-rv-border">
            <div className="p-3 border-b border-rv-border flex items-center justify-between bg-rv-surface">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rv-subtext">Layer Stack</span>
              <ListBulletIcon className="w-3.5 h-3.5 text-rv-subtext" />
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
              {layers.map((layer, idx) => (
                <div 
                  key={layer.id}
                  onClick={() => setActiveIndex(idx)}
                  className={`flex items-center gap-2 px-2 py-2 rounded-sm cursor-pointer transition-all border group ${idx === activeIndex ? 'bg-rv-accent/10 border-rv-accent' : 'border-transparent hover:bg-white/5'}`}
                >
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'up'); }} className="text-rv-subtext hover:text-white"><ChevronDownIcon className="w-3 h-3 rotate-180" /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'down'); }} className="text-rv-subtext hover:text-white"><ChevronDownIcon className="w-3 h-3" /></button>
                  </div>
                  <CubeIcon className={`w-3.5 h-3.5 ${idx === activeIndex ? 'text-rv-accent' : 'text-rv-subtext'}`} />
                  <span className={`text-[11px] truncate flex-1 ${idx === activeIndex ? 'text-rv-text font-bold' : 'text-rv-subtext'}`}>{layer.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id); }} className="p-1 text-rv-subtext hover:text-rv-accent">
                      {layer.properties.visible ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeSlashIcon className="w-3.5 h-3.5 text-rv-danger" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} className="p-1 text-rv-subtext hover:text-rv-danger">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {layers.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-30">
                  <Square2StackIcon className="w-8 h-8 mb-2" />
                  <p className="text-[9px] uppercase font-bold tracking-widest">Workspace Empty</p>
                </div>
              )}
            </div>
          </div>

          {/* Library */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-3 border-b border-rv-border flex items-center justify-between bg-rv-surface">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rv-subtext">Primitives</span>
              <SparklesIcon className="w-3.5 h-3.5 text-rv-subtext" />
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 grid grid-cols-3 gap-1 content-start custom-scrollbar">
              {PRIMITIVES.map(p => (
                <button 
                  key={p.type}
                  onClick={() => generatePrimitive(p.type)}
                  className="bg-rv-surface border border-rv-border hover:border-rv-accent p-2 rounded-sm flex flex-col items-center justify-center gap-1 group transition-all active:scale-95"
                  title={`Add ${p.name}`}
                >
                  <CubeIcon className="w-4 h-4 text-rv-subtext group-hover:text-rv-accent" />
                  <span className="text-[8px] font-bold uppercase tracking-tight text-rv-subtext group-hover:text-rv-text truncate w-full text-center">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-rv-surface border-t border-rv-border flex gap-2">
            <input type="file" id="model-upload" className="hidden" accept=".glb,.gltf,.obj,.stl,.fbx" onChange={(e) => e.target.files && handleImportRequest(e.target.files)} multiple />
            <label htmlFor="model-upload" className="flex-1 h-8 bg-rv-accent hover:bg-rv-accentHover text-white text-[10px] font-bold uppercase tracking-widest rounded-sm flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg">
              <PlusIcon className="w-3 h-3" /> Import
            </label>
          </div>
        </aside>

        {/* Center Viewport */}
        <main className="flex-1 relative bg-black group overflow-hidden">
          <ModelViewer3D layers={layers} layerObjects={layerObjects} config={viewerConfig} />
          
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-rv-accent/10 border-2 border-rv-accent border-dashed flex flex-col items-center justify-center backdrop-blur-sm animate-pulse">
              <CloudArrowUpIcon className="w-16 h-16 text-rv-accent mb-4" />
              <span className="text-xl font-bold uppercase tracking-widest text-rv-accent">Import to Session</span>
            </div>
          )}

          {/* HUD Overlays */}
          <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-2">
            {activeLayer && (
              <div className="bg-rv-panel/80 backdrop-blur-md border border-white/5 p-4 rounded-sm shadow-2xl min-w-[200px]">
                <div className="flex items-center justify-between mb-3">
                   <span className="text-[10px] font-black text-rv-accent uppercase tracking-widest">Active Layer</span>
                   <span className="text-[9px] font-mono text-rv-subtext">#{activeIndex + 1}</span>
                </div>
                <div className="text-xs font-bold text-rv-text uppercase mb-2 truncate">{activeLayer.name}</div>
                {activeLayer.analysis && (
                  <div className="space-y-1 font-mono text-[9px] text-rv-subtext">
                    <div className="flex justify-between"><span>Triangles:</span><span className="text-rv-text">{activeLayer.analysis.triangles.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Materials:</span><span className="text-rv-text">{activeLayer.analysis.materials}</span></div>
                  </div>
                )}
              </div>
            )}
            {viewerConfig.isProMode && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-sm backdrop-blur">
                <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Advanced Telemetry Active</span>
              </div>
            )}
          </div>

          {/* Quick Toolbar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-rv-panel/80 backdrop-blur-md p-1 rounded-sm border border-rv-border opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-2xl">
            <button onClick={() => setViewerConfig(prev => ({...prev, showGrid: !prev.showGrid}))} className={`p-2 rounded-sm transition-colors ${viewerConfig.showGrid ? 'bg-rv-accent text-white' : 'text-rv-subtext hover:text-white'}`} title="Grid"><ArrowsPointingOutIcon className="w-4 h-4" /></button>
            <button onClick={() => setViewerConfig(prev => ({...prev, wireframe: !prev.wireframe}))} className={`p-2 rounded-sm transition-colors ${viewerConfig.wireframe ? 'bg-rv-accent text-white' : 'text-rv-subtext hover:text-white'}`} title="Wireframe"><Square3Stack3DIcon className="w-4 h-4" /></button>
            <button onClick={() => setViewerConfig(prev => ({...prev, autoRotate: !prev.autoRotate}))} className={`p-2 rounded-sm transition-colors ${viewerConfig.autoRotate ? 'bg-rv-accent text-white' : 'text-rv-subtext hover:text-white'}`} title="Rotate"><ArrowPathIcon className="w-4 h-4" /></button>
            {viewerConfig.isProMode && (
              <button onClick={() => setViewerConfig(prev => ({...prev, showNormals: !prev.showNormals}))} className={`p-2 rounded-sm transition-colors ${viewerConfig.showNormals ? 'bg-amber-500 text-black' : 'text-rv-subtext hover:text-white'}`} title="Normals"><BeakerIcon className="w-4 h-4" /></button>
            )}
          </div>
        </main>

        {/* Right Sidebar: Properties */}
        <aside className="w-80 bg-rv-panel border-l border-rv-border flex flex-col shrink-0">
          
          <div className="p-3 border-b border-rv-border bg-rv-surface flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rv-subtext">Visual Properties</span>
            <AdjustmentsVerticalIcon className="w-3.5 h-3.5 text-rv-subtext" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
            {activeLayer ? (
              <>
                {/* Material Controls */}
                <div className="space-y-4">
                  <span className="text-[10px] font-bold text-rv-subtext uppercase tracking-widest block mb-1">Appearance</span>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="text-[9px] text-rv-subtext mb-1 uppercase tracking-tighter">Layer Color</div>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          value={activeLayer.properties.color}
                          onChange={(e) => updateLayerProperty(activeLayer.id, { color: e.target.value })}
                          className="w-8 h-8 bg-transparent border-0 cursor-pointer rounded overflow-hidden"
                        />
                        <input 
                          type="text"
                          value={activeLayer.properties.color}
                          onChange={(e) => updateLayerProperty(activeLayer.id, { color: e.target.value })}
                          className="flex-1 bg-rv-surface border border-rv-border rounded-sm text-[10px] font-mono text-rv-text px-2 uppercase"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-rv-subtext mb-1 uppercase tracking-tighter">
                      <span>Layer Opacity</span>
                      <span>{Math.round(activeLayer.properties.opacity * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.01" 
                      value={activeLayer.properties.opacity} 
                      onChange={(e) => updateLayerProperty(activeLayer.id, { opacity: parseFloat(e.target.value) })} 
                    />
                  </div>
                </div>

                {/* Transform Controls */}
                <div className="space-y-4 pt-6 border-t border-rv-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-rv-subtext uppercase tracking-widest">Transform</span>
                    <button 
                      onClick={() => updateLayerProperty(activeLayer.id, createDefaultProperties())}
                      className="text-[8px] font-bold text-rv-accent uppercase hover:underline"
                    >
                      Reset
                    </button>
                  </div>
                  
                  {/* Scale */}
                  <div className="space-y-2">
                    <div className="text-[9px] text-rv-subtext uppercase tracking-tighter flex items-center gap-1.5"><ArrowsPointingOutIcon className="w-2.5 h-2.5" /> Uniform Scale</div>
                    <input 
                      type="range" min="0.1" max="5" step="0.1" 
                      value={activeLayer.properties.scale.x} 
                      onChange={(e) => {
                        const s = parseFloat(e.target.value);
                        updateLayerProperty(activeLayer.id, { scale: { x: s, y: s, z: s }});
                      }} 
                    />
                  </div>

                  {/* Position */}
                  <div className="space-y-3">
                    <div className="text-[9px] text-rv-subtext uppercase tracking-tighter flex items-center gap-1.5"><ArrowsPointingInIcon className="w-2.5 h-2.5" /> Global Offset</div>
                    <div className="space-y-2">
                       {['x', 'y', 'z'].map(axis => (
                          <div key={axis} className="flex items-center gap-2">
                             <span className="text-[8px] font-bold text-rv-subtext uppercase w-4">{axis}</span>
                             <input 
                                type="range" min="-5" max="5" step="0.1" 
                                value={(activeLayer.properties.position as any)[axis]} 
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateLayerProperty(activeLayer.id, { position: { ...activeLayer.properties.position, [axis]: val }});
                                }} 
                                className="flex-1"
                             />
                          </div>
                       ))}
                    </div>
                  </div>
                </div>

                {/* Layer Hierarchy (Pro Only) */}
                {viewerConfig.isProMode && (
                   <div className="space-y-4 pt-6 border-t border-rv-border animate-fade-in">
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2"><LinkIcon className="w-3 h-3" /> Hierarchy Binding</span>
                      <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-sm">
                         <div className="text-[9px] text-rv-subtext mb-2 uppercase">Parent Component</div>
                         <select 
                           value={activeLayer.properties.parentId || ""}
                           onChange={(e) => updateLayerProperty(activeLayer.id, { parentId: e.target.value || undefined })}
                           className="w-full bg-rv-bg border border-rv-border text-[10px] font-bold text-rv-text p-1.5 outline-none focus:border-amber-500"
                         >
                            <option value="">No Binding (Scene Root)</option>
                            {layers.filter(l => l.id !== activeLayer.id).map(l => (
                               <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                         </select>
                         <p className="text-[8px] text-rv-subtext mt-2 leading-relaxed">Child objects inherit transformations from their parent component.</p>
                      </div>
                   </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                <AdjustmentsVerticalIcon className="w-12 h-12 mb-4" />
                <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">Select a layer to modify its visual properties</p>
              </div>
            )}
          </div>

          {/* Export Action */}
          <div className="p-4 bg-rv-surface border-t border-rv-border">
             <button 
              onClick={handleExport}
              disabled={layers.length === 0 || isProcessing}
              className="w-full h-10 bg-rv-text hover:bg-white text-rv-bg text-[10px] font-black uppercase tracking-widest rounded-sm flex items-center justify-center gap-2 transition-all shadow-xl disabled:opacity-30"
             >
               <ArrowDownTrayIcon className="w-4 h-4" /> Export Combined Composition
             </button>
          </div>
        </aside>
      </div>

      {/* Import Prompt Modal */}
      {showImportPrompt && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
              <div className="bg-rv-panel border border-rv-border p-8 rounded shadow-2xl max-w-md w-full text-center space-y-6">
                 <div className="bg-rv-accent/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-rv-accent/20">
                    <CloudArrowUpIcon className="w-8 h-8 text-rv-accent" />
                 </div>
                 <div className="space-y-2">
                    <h3 className="text-sm font-black uppercase tracking-widest text-rv-text">Initialize New Session?</h3>
                    <p className="text-xs text-rv-subtext leading-relaxed">External assets detected. Would you like to clear the current workspace or append these models to your existing scene?</p>
                 </div>
                 <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => processImport(pendingFiles, 'new')}
                      className="w-full py-3 bg-white text-rv-bg text-[10px] font-black uppercase tracking-widest rounded-sm hover:bg-rv-accent hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                       <ComputerDesktopIcon className="w-4 h-4" /> New Clean Workspace
                    </button>
                    <button 
                      onClick={() => processImport(pendingFiles, 'append')}
                      className="w-full py-3 bg-rv-surface border border-rv-border text-rv-text text-[10px] font-black uppercase tracking-widest rounded-sm hover:border-rv-accent transition-all flex items-center justify-center gap-2"
                    >
                       <Square2StackIcon className="w-4 h-4" /> Append to Current Scene
                    </button>
                    <button 
                      onClick={() => { setPendingFiles(null); setShowImportPrompt(false); }}
                      className="w-full py-3 text-rv-subtext text-[10px] font-bold uppercase tracking-widest hover:text-rv-danger transition-colors"
                    >
                       Dismiss
                    </button>
                 </div>
              </div>
          </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <div className="bg-rv-panel rounded-sm shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh] border border-rv-border">
            <div className="p-5 border-b border-rv-border flex items-center justify-between bg-rv-surface">
              <div className="flex items-center gap-3">
                <InformationCircleIcon className="w-5 h-5 text-rv-accent" />
                <h2 className="text-sm font-bold text-rv-text uppercase tracking-widest">Stellar View Engineering Manual</h2>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-rv-subtext hover:text-white transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 overflow-y-auto space-y-10 custom-scrollbar">
              <section className="space-y-4">
                <h3 className="text-[10px] font-black text-rv-accent uppercase tracking-widest border-b border-rv-border pb-1">Layer Stack Logic</h3>
                <p className="text-xs text-rv-subtext leading-relaxed">
                   Stellar View operates using a <strong className="text-rv-text">composition-based layer system</strong>. Every object, whether imported or procedurally generated, acts as an independent layer with its own set of visual properties. Use the left sidebar to manage hierarchy, visibility, and stack order.
                </p>
              </section>
              <section className="space-y-4">
                <h3 className="text-[10px] font-black text-rv-accent uppercase tracking-widest border-b border-rv-border pb-1">Professional Mode</h3>
                <p className="text-xs text-rv-subtext leading-relaxed">
                    Unlocking <strong className="text-amber-500">Pro Mode</strong> grants access to advanced engineering telemetry including vertex normal visualization, enhanced lighting environments, and <strong className="text-rv-text">Component Binding</strong>. Component Binding allows you to parent layers to one another, creating complex kinematic relationships.
                </p>
              </section>
            </div>
            <div className="p-6 bg-rv-surface border-t border-rv-border flex justify-end">
              <button 
                onClick={() => setShowHelp(false)}
                className="px-8 py-2 bg-rv-accent text-white text-[10px] font-bold uppercase tracking-widest rounded-sm"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelStudioTool;

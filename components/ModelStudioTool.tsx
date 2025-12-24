
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
  ArrowsPointingInIcon,
  Bars3Icon
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
  
  // Mobile UI States
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [showLeftSidebar, setShowLeftSidebar] = useState(window.innerWidth >= 1024);
  const [showRightSidebar, setShowRightSidebar] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setShowLeftSidebar(true);
        setShowRightSidebar(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    if (isMobile) setShowLeftSidebar(false);
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
    if (isMobile) setShowLeftSidebar(false);
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
    if (isMobile) setShowRightSidebar(false);
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
      className={`h-screen bg-rv-bg flex flex-col select-none overflow-hidden ${viewerConfig.isProMode ? 'pro-mode' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!isMobile) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files && !isMobile) handleImportRequest(e.dataTransfer.files); }}
    >
      {/* Header */}
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
              <CubeIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight text-rv-text uppercase sm:inline">Stellar<span className="font-light text-rv-subtext hidden sm:inline">Viewer</span></span>
          </div>
          <div className="hidden sm:block h-4 w-px bg-rv-border mx-2"></div>
          <button 
            onClick={() => setViewerConfig(prev => ({ ...prev, isProMode: !prev.isProMode }))}
            className={`px-3 h-6 rounded-full text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${viewerConfig.isProMode ? 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-rv-surface text-rv-subtext border border-rv-border hover:text-rv-text'}`}
          >
            <BeakerIcon className="w-3 h-3" /> <span className="hidden sm:inline">{viewerConfig.isProMode ? 'PRO UNLOCKED' : 'GO PRO'}</span>
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => setShowHelp(true)} className="text-rv-subtext hover:text-rv-text transition-colors">
            <QuestionMarkCircleIcon className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowRightSidebar(!showRightSidebar)}
            className="lg:hidden p-1.5 text-rv-subtext hover:text-white bg-rv-surface rounded-sm border border-rv-border"
          >
            <AdjustmentsVerticalIcon className="w-5 h-5" />
          </button>
          <div className="hidden lg:block text-[10px] font-mono text-rv-subtext uppercase tracking-widest">Layers: {layers.length}</div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Sidebar: Layers & Primitives */}
        <aside className={`
          fixed lg:relative inset-y-0 left-0 w-64 bg-rv-panel border-r border-rv-border flex flex-col shrink-0 z-40 transition-transform duration-300
          ${showLeftSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="flex lg:hidden justify-between items-center p-3 border-b border-rv-border bg-rv-surface">
            <span className="text-[10px] font-black uppercase text-rv-accent tracking-widest">Scene Hierarchy</span>
            <button onClick={() => setShowLeftSidebar(false)}><XMarkIcon className="w-5 h-5 text-rv-subtext" /></button>
          </div>
          
          {/* Layer Stack */}
          <div className="flex flex-col h-1/2 lg:h-2/3 overflow-hidden border-b border-rv-border">
            <div className="p-3 border-b border-rv-border flex items-center justify-between bg-rv-surface">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rv-subtext">Layer Stack</span>
              <ListBulletIcon className="w-3.5 h-3.5 text-rv-subtext" />
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
              {layers.map((layer, idx) => (
                <div 
                  key={layer.id}
                  onClick={() => { setActiveIndex(idx); if (isMobile) setShowLeftSidebar(false); }}
                  className={`flex items-center gap-2 px-2 py-2 rounded-sm cursor-pointer transition-all border group ${idx === activeIndex ? 'bg-rv-accent/10 border-rv-accent' : 'border-transparent hover:bg-white/5'}`}
                >
                  <div className="flex flex-col gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'up'); }} className="text-rv-subtext hover:text-white"><ChevronDownIcon className="w-3 h-3 rotate-180" /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'down'); }} className="text-rv-subtext hover:text-white"><ChevronDownIcon className="w-3 h-3" /></button>
                  </div>
                  <CubeIcon className={`w-3.5 h-3.5 ${idx === activeIndex ? 'text-rv-accent' : 'text-rv-subtext'}`} />
                  <span className={`text-[11px] truncate flex-1 ${idx === activeIndex ? 'text-rv-text font-bold' : 'text-rv-subtext'}`}>{layer.name}</span>
                  <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100">
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
          
          {isDragging && !isMobile && (
            <div className="absolute inset-0 z-50 bg-rv-accent/10 border-2 border-rv-accent border-dashed flex flex-col items-center justify-center backdrop-blur-sm animate-pulse">
              <CloudArrowUpIcon className="w-16 h-16 text-rv-accent mb-4" />
              <span className="text-xl font-bold uppercase tracking-widest text-rv-accent">Import to Session</span>
            </div>
          )}

          {/* HUD Overlays */}
          <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-2">
            {activeLayer && !showLeftSidebar && (
              <div className="bg-rv-panel/80 backdrop-blur-md border border-white/5 p-4 rounded-sm shadow-2xl min-w-[160px]">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-[8px] font-black text-rv-accent uppercase tracking-widest">Active Layer</span>
                </div>
                <div className="text-[10px] font-bold text-rv-text uppercase truncate">{activeLayer.name}</div>
              </div>
            )}
          </div>

          {/* Quick Toolbar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-rv-panel/80 backdrop-blur-md p-1 rounded-sm border border-rv-border transition-all duration-300 shadow-2xl z-20">
            <button onClick={() => setViewerConfig(prev => ({...prev, showGrid: !prev.showGrid}))} className={`p-2 rounded-sm transition-colors ${viewerConfig.showGrid ? 'bg-rv-accent text-white' : 'text-rv-subtext hover:text-white'}`} title="Grid"><ArrowsPointingOutIcon className="w-4 h-4" /></button>
            <button onClick={() => setViewerConfig(prev => ({...prev, wireframe: !prev.wireframe}))} className={`p-2 rounded-sm transition-colors ${viewerConfig.wireframe ? 'bg-rv-accent text-white' : 'text-rv-subtext hover:text-white'}`} title="Wireframe"><Square3Stack3DIcon className="w-4 h-4" /></button>
            <button onClick={() => setViewerConfig(prev => ({...prev, autoRotate: !prev.autoRotate}))} className={`p-2 rounded-sm transition-colors ${viewerConfig.autoRotate ? 'bg-rv-accent text-white' : 'text-rv-subtext hover:text-white'}`} title="Rotate"><ArrowPathIcon className="w-4 h-4" /></button>
            {viewerConfig.isProMode && (
              <button onClick={() => setViewerConfig(prev => ({...prev, showNormals: !prev.showNormals}))} className={`p-2 rounded-sm transition-colors ${viewerConfig.showNormals ? 'bg-amber-500 text-black' : 'text-rv-subtext hover:text-white'}`} title="Normals"><BeakerIcon className="w-4 h-4" /></button>
            )}
          </div>
        </main>

        {/* Right Sidebar: Properties */}
        <aside className={`
          fixed lg:relative inset-y-0 right-0 w-80 bg-rv-panel border-l border-rv-border flex flex-col shrink-0 z-40 transition-transform duration-300
          ${showRightSidebar ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}>
          <div className="p-3 border-b border-rv-border bg-rv-surface flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rv-subtext">Visual Properties</span>
            <button onClick={() => setShowRightSidebar(false)} className="lg:hidden"><XMarkIcon className="w-5 h-5 text-rv-subtext" /></button>
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
                    <div className="text-[9px] text-rv-subtext uppercase tracking-tighter flex items-center gap-1.5"><ArrowsPointingOutIcon className="w-2.5 h-2.5" /> Scale</div>
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
                    <div className="text-[9px] text-rv-subtext uppercase tracking-tighter flex items-center gap-1.5"><ArrowsPointingInIcon className="w-2.5 h-2.5" /> Offset</div>
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
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2"><LinkIcon className="w-3 h-3" /> Binding</span>
                      <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-sm">
                         <div className="text-[9px] text-rv-subtext mb-2 uppercase">Parent Layer</div>
                         <select 
                           value={activeLayer.properties.parentId || ""}
                           onChange={(e) => updateLayerProperty(activeLayer.id, { parentId: e.target.value || undefined })}
                           className="w-full bg-rv-bg border border-rv-border text-[10px] font-bold text-rv-text p-1.5 outline-none focus:border-amber-500"
                         >
                            <option value="">None</option>
                            {layers.filter(l => l.id !== activeLayer.id).map(l => (
                               <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                         </select>
                      </div>
                   </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                <AdjustmentsVerticalIcon className="w-12 h-12 mb-4" />
                <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">Select a layer to modify properties</p>
              </div>
            )}
          </div>

          {/* Export Action */}
          <div className="p-4 bg-rv-surface border-t border-rv-border mt-auto">
             <button 
              onClick={handleExport}
              disabled={layers.length === 0 || isProcessing}
              className="w-full h-10 bg-rv-text hover:bg-white text-rv-bg text-[10px] font-black uppercase tracking-widest rounded-sm flex items-center justify-center gap-2 transition-all shadow-xl disabled:opacity-30"
             >
               <ArrowDownTrayIcon className="w-4 h-4" /> Export Composition
             </button>
          </div>
        </aside>

        {/* Mobile Sidebar Overlays */}
        {isMobile && (showLeftSidebar || showRightSidebar) && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => { setShowLeftSidebar(false); setShowRightSidebar(false); }}
          />
        )}
      </div>

      {/* Import Prompt Modal */}
      {showImportPrompt && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
              <div className="bg-rv-panel border border-rv-border p-6 sm:p-8 rounded shadow-2xl max-w-md w-full text-center space-y-6">
                 <div className="bg-rv-accent/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-rv-accent/20">
                    <CloudArrowUpIcon className="w-8 h-8 text-rv-accent" />
                 </div>
                 <div className="space-y-2">
                    <h3 className="text-sm font-black uppercase tracking-widest text-rv-text">Initialize New Session?</h3>
                    <p className="text-xs text-rv-subtext leading-relaxed">Assets detected. Would you like to clear the workspace or append to your existing scene?</p>
                 </div>
                 <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => processImport(pendingFiles, 'new')}
                      className="w-full py-3 bg-white text-rv-bg text-[10px] font-black uppercase tracking-widest rounded-sm hover:bg-rv-accent hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                       <ComputerDesktopIcon className="w-4 h-4" /> New Workspace
                    </button>
                    <button 
                      onClick={() => processImport(pendingFiles, 'append')}
                      className="w-full py-3 bg-rv-surface border border-rv-border text-rv-text text-[10px] font-black uppercase tracking-widest rounded-sm hover:border-rv-accent transition-all flex items-center justify-center gap-2"
                    >
                       <Square2StackIcon className="w-4 h-4" /> Append to Scene
                    </button>
                    <button 
                      onClick={() => { setPendingFiles(null); setShowImportPrompt(false); }}
                      className="w-full py-2 text-rv-subtext text-[9px] font-bold uppercase tracking-widest hover:text-rv-danger transition-colors"
                    >
                       Dismiss
                    </button>
                 </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ModelStudioTool;

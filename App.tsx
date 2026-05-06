import React, { Suspense, lazy, useState } from 'react';
import {
  ChevronRightIcon,
  RocketLaunchIcon,
  SparklesIcon,
  CubeIcon,
  CpuChipIcon,
  PhotoIcon
} from '@heroicons/react/24/solid';

const NebulaTool = lazy(() => import('./components/NebulaTool'));
const PhotoFramerTool = lazy(() => import('./components/PhotoFramerTool'));
const ModelStudioTool = lazy(() => import('./components/ModelStudioTool'));
const PhotoCompressorTool = lazy(() => import('./components/PhotoCompressorTool'));

type ToolId = 'home' | 'nebula-weaver' | 'photo-framer' | 'model-studio' | 'photo-compressor';

const ToolLoadingFallback: React.FC = () => (
  <div className="h-screen w-screen bg-rv-bg flex items-center justify-center">
    <div className="text-rv-subtext text-xs font-mono uppercase tracking-widest">Loading module...</div>
  </div>
);

interface ToolCardProps {
  title: string;
  desc: string;
  icon: React.ReactElement;
  onLaunch: () => void;
  version: string;
}

const ToolCard: React.FC<ToolCardProps> = ({ title, desc, icon, onLaunch, version }) => (
  <div
    className="bg-rv-panel border border-rv-border p-6 sm:p-8 rounded-sm hover:border-rv-accent transition-all duration-500 group relative overflow-hidden flex flex-col justify-between h-72 sm:h-80 cursor-pointer shadow-2xl"
    onClick={onLaunch}
  >
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 group-hover:text-rv-accent transition-all duration-500 translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0">
      {React.cloneElement(icon, { className: 'w-20 h-20 sm:w-24 sm:h-24' })}
    </div>
    <div>
      <div className="bg-rv-surface w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-sm border border-rv-border mb-4 sm:mb-6 group-hover:bg-rv-accent group-hover:text-white transition-all duration-500">
        {icon}
      </div>
      <h2 className="text-lg sm:text-xl font-bold text-rv-text mb-2 sm:mb-3 uppercase tracking-tight">{title}</h2>
      <p className="text-[11px] sm:text-xs text-rv-subtext leading-relaxed font-light">{desc}</p>
    </div>
    <div className="flex items-center justify-between mt-6 sm:mt-8">
      <span className="text-[9px] sm:text-[10px] font-mono font-bold text-rv-subtext/40">{version}</span>
      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-rv-accent group-hover:translate-x-2 transition-transform duration-500 flex items-center gap-1">
        Initialize <ChevronRightIcon className="w-3 h-3" />
      </span>
    </div>
  </div>
);

const App: React.FC = () => {
  const [currentTool, setCurrentTool] = useState<ToolId>('home');

  if (currentTool === 'nebula-weaver') {
    return (
      <Suspense fallback={<ToolLoadingFallback />}>
        <NebulaTool onBack={() => setCurrentTool('home')} />
      </Suspense>
    );
  }

  if (currentTool === 'photo-framer') {
    return (
      <Suspense fallback={<ToolLoadingFallback />}>
        <PhotoFramerTool onBack={() => setCurrentTool('home')} />
      </Suspense>
    );
  }

  if (currentTool === 'model-studio') {
    return (
      <Suspense fallback={<ToolLoadingFallback />}>
        <ModelStudioTool onBack={() => setCurrentTool('home')} />
      </Suspense>
    );
  }

  if (currentTool === 'photo-compressor') {
    return (
      <Suspense fallback={<ToolLoadingFallback />}>
        <PhotoCompressorTool onBack={() => setCurrentTool('home')} />
      </Suspense>
    );
  }

  return (
    <div className="h-screen bg-rv-bg flex flex-col font-sans selection:bg-rv-accent selection:text-white">
      <header className="h-14 bg-rv-panel border-b border-rv-border flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <RocketLaunchIcon className="w-5 h-5 text-rv-accent" />
          <span className="text-sm font-black tracking-tighter text-rv-text uppercase">
            Stellar Studio <span className="text-rv-subtext font-light hidden xs:inline">OS</span>
          </span>
        </div>
        <div className="text-[10px] font-mono text-rv-subtext uppercase tracking-widest hidden sm:block">
          Secure Production Environment
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[radial-gradient(circle_at_center,_#111_0%,_#0a0a0a_100%)]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 py-4 sm:py-10">
          <ToolCard
            title="Nebula Weaver"
            desc="Advanced star-parallax mapping for deep space cinematic visualization."
            icon={<SparklesIcon className="w-6 h-6" />}
            onLaunch={() => setCurrentTool('nebula-weaver')}
            version="v2.5"
          />

          <ToolCard
            title="Model Studio"
            desc="Industrial 3D asset optimization pipeline with automated recording."
            icon={<CubeIcon className="w-6 h-6" />}
            onLaunch={() => setCurrentTool('model-studio')}
            version="v0.4"
          />

          <ToolCard
            title="Photo Shrink"
            desc="Batch image optimizer with intelligent target-size bit depth matching."
            icon={<CpuChipIcon className="w-6 h-6" />}
            onLaunch={() => setCurrentTool('photo-compressor')}
            version="v1.0"
          />

          <ToolCard
            title="Photo Framer"
            desc="Glassmorphism framing for astrophotography cataloging."
            icon={<PhotoIcon className="w-6 h-6" />}
            onLaunch={() => setCurrentTool('photo-framer')}
            version="v1.2"
          />
        </div>
      </main>

      <footer className="h-10 bg-rv-panel border-t border-rv-border px-6 flex items-center justify-between shrink-0">
        <span className="text-[9px] font-bold text-rv-subtext uppercase tracking-wider">© 2024 Stellar Studio Production</span>
        <div className="hidden sm:flex gap-4 text-[9px] font-bold text-rv-subtext uppercase">
          <span className="hover:text-rv-text cursor-help">Docs</span>
          <span className="hover:text-rv-text cursor-help">API</span>
          <span className="hover:text-rv-text cursor-help">Status</span>
        </div>
      </footer>
    </div>
  );
};

export default App;

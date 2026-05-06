export type RafFn = (callback: FrameRequestCallback) => number;
export type CancelRafFn = (handle: number) => void;

export interface RafLoop {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export const createRafLoop = (
  onFrame: () => void,
  raf: RafFn = requestAnimationFrame,
  cancelRaf: CancelRafFn = cancelAnimationFrame
): RafLoop => {
  let frameId: number | null = null;
  let running = false;

  const tick = () => {
    if (!running) return;
    onFrame();
    frameId = raf(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      frameId = raf(tick);
    },
    stop() {
      running = false;
      if (frameId !== null) {
        cancelRaf(frameId);
        frameId = null;
      }
    },
    isRunning() {
      return running;
    }
  };
};


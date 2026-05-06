import { describe, it, expect, vi } from 'vitest';
import { createRafLoop } from '../services/rafLoop';

describe('createRafLoop', () => {
  it('schedules frames and cancels the latest handle when stopped', () => {
    let nextHandle = 1;
    const callbacks = new Map<number, FrameRequestCallback>();

    const raf = vi.fn((cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      callbacks.set(handle, cb);
      return handle;
    });
    const cancelRaf = vi.fn((handle: number) => {
      callbacks.delete(handle);
    });

    const onFrame = vi.fn();
    const loop = createRafLoop(onFrame, raf, cancelRaf);

    loop.start();
    expect(loop.isRunning()).toBe(true);
    expect(raf).toHaveBeenCalledTimes(1);

    const first = callbacks.get(1);
    expect(first).toBeTypeOf('function');
    first?.(16.7);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(raf).toHaveBeenCalledTimes(2);

    loop.stop();
    expect(loop.isRunning()).toBe(false);
    expect(cancelRaf).toHaveBeenCalledWith(2);
  });

  it('is idempotent when started repeatedly', () => {
    const raf = vi.fn(() => 1);
    const cancelRaf = vi.fn();
    const onFrame = vi.fn();
    const loop = createRafLoop(onFrame, raf, cancelRaf);

    loop.start();
    loop.start();

    expect(raf).toHaveBeenCalledTimes(1);
  });
});


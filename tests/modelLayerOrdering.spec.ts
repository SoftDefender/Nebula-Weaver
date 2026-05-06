import { describe, it, expect } from 'vitest';
import { moveLayerById, getNextActiveIndexAfterMove } from '../services/modelLayerOrdering';
import { ModelStudioItem } from '../types';

const makeLayer = (id: string): ModelStudioItem => ({
  id,
  name: id,
  url: id,
  format: 'primitive',
  status: 'success',
  properties: {
    color: '#fff',
    opacity: 1,
    scale: { x: 1, y: 1, z: 1 },
    position: { x: 0, y: 0, z: 0 },
    visible: true
  }
});

describe('modelLayerOrdering', () => {
  it('moves layer by id and returns source/target indices', () => {
    const layers = [makeLayer('A'), makeLayer('B'), makeLayer('C')];
    const moved = moveLayerById(layers, 'C', 'up');
    expect(moved).not.toBeNull();
    expect(moved?.movedFrom).toBe(2);
    expect(moved?.movedTo).toBe(1);
    expect(moved?.nextLayers.map((l) => l.id)).toEqual(['A', 'C', 'B']);
  });

  it('keeps active layer identity when moving other layers across it', () => {
    // Active layer is B at index 1. Move A down across B.
    expect(getNextActiveIndexAfterMove(1, 0, 1)).toBe(0);

    // Active layer is B at index 1. Move C up across B.
    expect(getNextActiveIndexAfterMove(1, 2, 1)).toBe(2);
  });

  it('moves active index only when active layer itself is moved', () => {
    expect(getNextActiveIndexAfterMove(2, 2, 1)).toBe(1);
    expect(getNextActiveIndexAfterMove(0, 0, 1)).toBe(1);
  });
});


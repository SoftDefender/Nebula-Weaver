import { describe, it, expect } from 'vitest';
import { clearDanglingParentRefs, wouldCreateParentCycle } from '../services/modelHierarchy';
import { ModelStudioItem } from '../types';

const makeLayer = (id: string, parentId?: string): ModelStudioItem => ({
  id,
  name: id,
  url: id,
  format: 'primitive',
  status: 'success',
  properties: {
    color: '#ffffff',
    opacity: 1,
    scale: { x: 1, y: 1, z: 1 },
    position: { x: 0, y: 0, z: 0 },
    visible: true,
    parentId
  }
});

describe('modelHierarchy', () => {
  it('rejects direct and indirect parent cycles', () => {
    const layers = [makeLayer('A'), makeLayer('B', 'A'), makeLayer('C', 'B')];

    expect(wouldCreateParentCycle(layers, 'A', 'A')).toBe(true);
    expect(wouldCreateParentCycle(layers, 'A', 'C')).toBe(true);
  });

  it('allows safe parent bindings', () => {
    const layers = [makeLayer('A'), makeLayer('B'), makeLayer('C', 'A')];
    expect(wouldCreateParentCycle(layers, 'B', 'A')).toBe(false);
    expect(wouldCreateParentCycle(layers, 'B', undefined)).toBe(false);
  });

  it('clears dangling parent refs after deletion', () => {
    const layers = [makeLayer('A'), makeLayer('B', 'A'), makeLayer('C', 'B')];
    const cleaned = clearDanglingParentRefs(layers, 'A');

    expect(cleaned.find((l) => l.id === 'B')?.properties.parentId).toBeUndefined();
    expect(cleaned.find((l) => l.id === 'C')?.properties.parentId).toBe('B');
  });
});


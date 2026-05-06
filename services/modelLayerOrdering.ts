import { ModelStudioItem } from '../types';

export type MoveDirection = 'up' | 'down';

export interface LayerMoveResult {
  nextLayers: ModelStudioItem[];
  movedFrom: number;
  movedTo: number;
}

export const moveLayerById = (
  layers: ModelStudioItem[],
  id: string,
  direction: MoveDirection
): LayerMoveResult | null => {
  const from = layers.findIndex((layer) => layer.id === id);
  if (from === -1) return null;

  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= layers.length) return null;

  const nextLayers = [...layers];
  [nextLayers[from], nextLayers[to]] = [nextLayers[to], nextLayers[from]];
  return {
    nextLayers,
    movedFrom: from,
    movedTo: to
  };
};

export const getNextActiveIndexAfterMove = (
  activeIndex: number,
  movedFrom: number,
  movedTo: number
) => {
  if (activeIndex < 0) return -1;
  if (activeIndex === movedFrom) return movedTo;

  // Moving item downward: indices in (movedFrom, movedTo] shift left.
  if (movedFrom < movedTo && activeIndex > movedFrom && activeIndex <= movedTo) {
    return activeIndex - 1;
  }

  // Moving item upward: indices in [movedTo, movedFrom) shift right.
  if (movedFrom > movedTo && activeIndex >= movedTo && activeIndex < movedFrom) {
    return activeIndex + 1;
  }

  return activeIndex;
};


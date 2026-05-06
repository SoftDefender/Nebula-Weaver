import { ModelStudioItem } from '../types';

const indexById = (layers: ModelStudioItem[]) =>
  new Map(layers.map((layer) => [layer.id, layer]));

export const wouldCreateParentCycle = (
  layers: ModelStudioItem[],
  layerId: string,
  nextParentId?: string
) => {
  if (!nextParentId) return false;
  if (nextParentId === layerId) return true;

  const byId = indexById(layers);
  const visited = new Set<string>();
  let cursor: string | undefined = nextParentId;

  while (cursor) {
    if (cursor === layerId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = byId.get(cursor)?.properties.parentId;
  }

  return false;
};

export const clearDanglingParentRefs = (layers: ModelStudioItem[], deletedId: string) =>
  layers.map((layer) =>
    layer.properties.parentId === deletedId
      ? {
          ...layer,
          properties: {
            ...layer.properties,
            parentId: undefined
          }
        }
      : layer
  );


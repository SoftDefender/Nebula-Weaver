import { describe, it, expect } from 'vitest';
import { getNextActiveIndexAfterDelete } from '../services/modelStudioState';

describe('getNextActiveIndexAfterDelete', () => {
  it('moves active index to previous slot when a prior layer is deleted', () => {
    expect(getNextActiveIndexAfterDelete(3, 1, 4)).toBe(2);
  });

  it('keeps active index when deleting a later layer', () => {
    expect(getNextActiveIndexAfterDelete(1, 3, 4)).toBe(1);
  });

  it('selects nearest valid index when deleting the active layer', () => {
    expect(getNextActiveIndexAfterDelete(2, 2, 2)).toBe(1);
    expect(getNextActiveIndexAfterDelete(0, 0, 2)).toBe(0);
  });

  it('returns -1 when all layers are removed', () => {
    expect(getNextActiveIndexAfterDelete(0, 0, 0)).toBe(-1);
  });
});


export const getNextActiveIndexAfterDelete = (
  currentActiveIndex: number,
  deletedIndex: number,
  nextLength: number
): number => {
  if (nextLength <= 0) return -1;
  if (currentActiveIndex < 0) return -1;

  if (currentActiveIndex === deletedIndex) {
    return Math.min(deletedIndex, nextLength - 1);
  }

  if (currentActiveIndex > deletedIndex) {
    return currentActiveIndex - 1;
  }

  return Math.min(currentActiveIndex, nextLength - 1);
};


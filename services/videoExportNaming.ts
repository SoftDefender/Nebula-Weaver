const sanitizeBaseName = (value?: string) => {
  const raw = (value || '').trim();
  if (!raw) return 'nebula';
  return raw.replace(/[\\/:*?"<>|]+/g, '_');
};

export const getVideoExtensionFromMime = (mimeType: string): string => {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('matroska')) return 'mkv';
  if (mimeType.includes('quicktime')) return 'mov';
  return 'webm';
};

export const buildNebulaExportFilename = (baseName: string | undefined, mimeType: string) => {
  const ext = getVideoExtensionFromMime(mimeType);
  return `${sanitizeBaseName(baseName)}_nebula.${ext}`;
};


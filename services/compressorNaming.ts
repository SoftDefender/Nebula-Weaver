import { CompressionSettings } from '../types';

const stem = (filename: string) => {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
};

const extFromFile = (filename: string) => {
  const dot = filename.lastIndexOf('.');
  return dot > -1 ? filename.slice(dot + 1).toLowerCase() : '';
};

const extFromMime = (mimeType?: string) => {
  if (!mimeType || !mimeType.includes('/')) return '';
  return mimeType.split('/')[1].toLowerCase();
};

export const resolveCompressedFilename = (
  originalFilename: string,
  settings: Pick<CompressionSettings, 'outputFormat'>,
  resultMimeType?: string
) => {
  const forcedExt =
    settings.outputFormat === 'original'
      ? extFromMime(resultMimeType) || extFromFile(originalFilename) || 'jpg'
      : settings.outputFormat.split('/')[1];

  return `${stem(originalFilename)}_optimized.${forcedExt}`;
};


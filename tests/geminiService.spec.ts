import { afterEach, describe, expect, test } from 'vitest';

import {
  analyzeNebulaImage,
  identifyNebulaFromImage
} from '../services/geminiService';

const oldApiKey = process.env.API_KEY;
const oldGeminiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (oldApiKey === undefined) delete process.env.API_KEY;
  else process.env.API_KEY = oldApiKey;

  if (oldGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = oldGeminiKey;
});

describe('geminiService fallback behavior', () => {
  test('identifyNebulaFromImage returns fallback when key is missing', async () => {
    delete process.env.API_KEY;
    delete process.env.GEMINI_API_KEY;

    const result = await identifyNebulaFromImage('data:image/jpeg;base64,AAAA');
    expect(result).toBe('Unknown Nebula');
  });

  test('analyzeNebulaImage returns fallback payload when key is missing', async () => {
    delete process.env.API_KEY;
    delete process.env.GEMINI_API_KEY;

    const result = await analyzeNebulaImage('data:image/jpeg;base64,AAAA', 'Test');
    expect(result.description).toBe('A mysterious cosmic cloud.');
    expect(Array.isArray(result.starHotspots)).toBe(true);
  });
});


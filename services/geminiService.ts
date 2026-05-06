import { NebulaAnalysis } from "../types";

type GeminiSdk = typeof import("@google/genai");
type GoogleGenAIInstance = import("@google/genai").GoogleGenAI;

let aiClient: GoogleGenAIInstance | null = null;
let sdkPromise: Promise<GeminiSdk> | null = null;
let hasWarnedMissingKey = false;

const loadGeminiSdk = async (): Promise<GeminiSdk> => {
  if (!sdkPromise) {
    sdkPromise = import("@google/genai");
  }
  return sdkPromise;
};

const getAiClient = async (): Promise<GoogleGenAIInstance | null> => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (!hasWarnedMissingKey) {
      console.warn("GEMINI_API_KEY is missing. Gemini features are disabled.");
      hasWarnedMissingKey = true;
    }
    return null;
  }

  if (aiClient) {
    return aiClient;
  }

  try {
    const { GoogleGenAI } = await loadGeminiSdk();
    aiClient = new GoogleGenAI({ apiKey });
    return aiClient;
  } catch (e) {
    console.error("Failed to initialize Gemini client", e);
    return null;
  }
};

// Fast identification step - runs immediately on upload
export const identifyNebulaFromImage = async (imageBase64: string): Promise<string> => {
  try {
    const ai = await getAiClient();
    if (!ai) return "Unknown Nebula";

    const base64Data = imageBase64.split(',')[1] || imageBase64;
    const response = await ai.models.generateContent({
      // Use gemini-3-flash-preview for speed and efficiency in identification tasks
      model: "gemini-3-flash-preview", 
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: "Identify the common name of this nebula. Return ONLY the name. If unknown, return 'Unknown Nebula'." },
        ],
      },
    });
    return response.text?.trim() || "Unknown Nebula";
  } catch (e) {
    console.error("Identity failed", e);
    return "Unknown Nebula";
  }
};

export const analyzeNebulaImage = async (
  imageBase64: string,
  nebulaName: string
): Promise<NebulaAnalysis> => {
  try {
    const ai = await getAiClient();
    if (!ai) {
      return {
        description: "A mysterious cosmic cloud.",
        dominantColors: ["#ffffff", "#ffd700"],
        starHotspots: [],
      };
    }
    const { Type } = await loadGeminiSdk();

    const prompt = `
      Analyze this image of the nebula named "${nebulaName}".
      1. Short poetic description (max 15 words).
      2. 2-3 dominant hex colors for stars.
      3. 5-10 key coordinate points (x,y 0-100) where stars are densest.
    `;

    const base64Data = imageBase64.split(',')[1] || imageBase64;

    const response = await ai.models.generateContent({
      // Use gemini-3-flash-preview for structured analysis tasks
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            dominantColors: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            starHotspots: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                },
                required: ["x", "y"],
              },
            },
          },
          required: ["description", "dominantColors", "starHotspots"],
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) throw new Error("No analysis returned");

    return JSON.parse(jsonStr) as NebulaAnalysis;
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return {
      description: "A mysterious cosmic cloud.",
      dominantColors: ["#ffffff", "#ffd700"],
      starHotspots: [],
    };
  }
};

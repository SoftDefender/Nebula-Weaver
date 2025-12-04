import { GoogleGenAI, Type } from "@google/genai";
import { NebulaAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeNebulaImage = async (
  imageBase64: string,
  nebulaName: string
): Promise<NebulaAnalysis> => {
  try {
    const prompt = `
      Analyze this image of the nebula named "${nebulaName}".
      I need data to generate a particle animation overlay.
      
      1. Provide a short, poetic description (max 20 words).
      2. Identify up to 3 dominant hex colors suitable for star particles.
      3. Identify roughly 10-20 "hotspot" coordinates (x, y) where stars seem most dense or bright. 
         Scale x and y from 0 to 100.
    `;

    // Remove header if present (data:image/jpeg;base64,)
    const base64Data = imageBase64.split(',')[1] || imageBase64;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg", // Assuming jpeg/png, API is flexible
              data: base64Data,
            },
          },
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

    const jsonText = response.text;
    if (!jsonText) throw new Error("No analysis returned");

    return JSON.parse(jsonText) as NebulaAnalysis;
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    // Fallback data
    return {
      description: "A mysterious cosmic cloud in deep space.",
      dominantColors: ["#ffffff", "#ffd700", "#87ceeb"],
      starHotspots: [],
    };
  }
};

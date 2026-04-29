import { type GoogleGenAI, Type } from "@google/genai";

const MODEL = "gemini-2.0-flash-lite";

async function getAi() {
  const { GoogleGenAI } = await import("@google/genai");
  return new GoogleGenAI({ apiKey: (import.meta as any).env?.VITE_GEMINI_API_KEY || '' });
}

export interface EncounterAnalysis {
  summary: string;
  diagnoses: string[];
  suggestedPlan: string;
}

export const analyzeEncounter = async (transcript: string): Promise<EncounterAnalysis> => {
  const ai = await getAi();
  if (!ai) throw new Error("Gemini API key not configured. Set VITE_GEMINI_API_KEY in .env");

  const prompt = `
    You are a medical AI assistant. Analyze the following transcript of a doctor-patient encounter.
    Extract:
    1. A concise summary of the visit.
    2. Potential diagnoses mentioned or implied.
    3. Suggested follow-up plan or medications discussed.

    Transcript:
    ${transcript}
  `;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          diagnoses: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          suggestedPlan: { type: Type.STRING }
        },
        required: ["summary", "diagnoses", "suggestedPlan"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text);
};

export const refineTranscription = async (rawTranscript: string): Promise<string> => {
  const ai = await getAi();
  if (!ai) throw new Error("Gemini API key not configured. Set VITE_GEMINI_API_KEY in .env");

  const prompt = `
    You are a professional medical scribe. The following text is a raw voice-to-text transcription of a clinical encounter. 
    Refine the text to be grammatically correct and professional, while maintaining all medical facts and clinical nuances.
    Fix any obvious transcription errors or phonetic misinterpretations.

    Raw Transcript:
    ${rawTranscript}
  `;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt
  });

  return response.text || rawTranscript;
};

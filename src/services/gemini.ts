import { GoogleGenAI } from "@google/genai";

const API_KEY_STORAGE = "pystudio_gemini_api_key";
const MODEL_STORAGE = "pystudio_gemini_model";
const DEFAULT_MODEL = "gemini-2.0-flash";

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "No Gemini API key configured. Add one in Settings → AI Assistant.",
    );
    this.name = "MissingApiKeyError";
  }
}

export function getGeminiApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setGeminiApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch (e) {
    console.error("Failed to persist API key", e);
  }
}

export function getGeminiModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setGeminiModel(model: string): void {
  try {
    if (model) localStorage.setItem(MODEL_STORAGE, model);
    else localStorage.removeItem(MODEL_STORAGE);
  } catch (e) {
    console.error("Failed to persist model", e);
  }
}

export async function askGemini(prompt: string, context?: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new MissingApiKeyError();

  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModel();
  const fullPrompt = context
    ? `You are an expert Python developer assistant. Here is the context of the user's current code:\n\n\`\`\`python\n${context}\n\`\`\`\n\nUser Question: ${prompt}`
    : prompt;

  const response = await ai.models.generateContent({
    model,
    contents: fullPrompt,
  });
  return response.text || "No response generated.";
}

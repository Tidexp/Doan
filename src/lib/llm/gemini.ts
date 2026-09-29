import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";

let client: GoogleGenerativeAI | null = null;

export function gemini() {
  const key = env().GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!client) client = new GoogleGenerativeAI(key);
  return client;
}

export function extractModel() {
  return gemini().getGenerativeModel({
    model: env().GEMINI_EXTRACT_MODEL,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });
}

export function answerModel() {
  return gemini().getGenerativeModel({
    model: env().GEMINI_ANSWER_MODEL,
    generationConfig: { temperature: 0.2 },
  });
}

export function embeddingModel() {
  return gemini().getGenerativeModel({
    model: env().GEMINI_EMBEDDING_MODEL,
  });
}

export function parseJsonObject<T>(raw: string): T {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice =
    start >= 0 && end >= 0 ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(slice) as T;
}

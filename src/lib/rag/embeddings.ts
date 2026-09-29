import pLimit from "p-limit";
import { env } from "@/lib/env";
import { embeddingModel } from "@/lib/llm/gemini";

export async function embedText(text: string): Promise<number[]> {
  const model = embeddingModel();
  const result = await model.embedContent(text.slice(0, 8000));
  const values = result.embedding.values;
  if (!values?.length) {
    throw new Error("Empty embedding from Gemini");
  }
  return values;
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  // p-limit keeps Gemini under rate limits; unbounded Promise.all would 429.
  const limit = pLimit(env().EMBED_CONCURRENCY);
  return Promise.all(texts.map((text) => limit(() => embedText(text))));
}

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

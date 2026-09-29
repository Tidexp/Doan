import { z } from "zod";

const envSchema = z.object({
  POSTGRES_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  NEO4J_URI: z.string().optional(),
  NEO4J_USERNAME: z.string().optional(),
  NEO4J_PASSWORD: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_EXTRACT_MODEL: z.string().default("gemini-2.0-flash-lite"),
  GEMINI_ANSWER_MODEL: z.string().default("gemini-2.0-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("text-embedding-004"),
  EMBED_CONCURRENCY: z.coerce.number().default(6),
  EXTRACT_CONCURRENCY: z.coerce.number().default(6),
  CHUNK_MAX_CHARS: z.coerce.number().default(3500),
  UPLOAD_DIR: z.string().default("./uploads"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function env(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

export function hasGemini() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function hasNeo4j() {
  return Boolean(
    process.env.NEO4J_URI &&
      process.env.NEO4J_USERNAME &&
      process.env.NEO4J_PASSWORD,
  );
}

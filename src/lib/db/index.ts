import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
};

function getClient() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is not set");
  }
  if (!globalForDb.sql) {
    globalForDb.sql = postgres(url, { max: 10 });
  }
  return globalForDb.sql;
}

export const db = drizzle(getClient(), { schema });

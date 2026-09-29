import neo4j, { Driver } from "neo4j-driver";
import { hasNeo4j } from "@/lib/env";

let driver: Driver | null = null;

export function getNeo4j(): Driver | null {
  if (!hasNeo4j()) return null;
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(
        process.env.NEO4J_USERNAME!,
        process.env.NEO4J_PASSWORD!,
      ),
    );
  }
  return driver;
}

export async function ensureGraphIndexes() {
  const neo = getNeo4j();
  if (!neo) return;
  const session = neo.session();
  try {
    await session.run(
      "CREATE INDEX entity_canonical IF NOT EXISTS FOR (n:Entity) ON (n.canonicalLabel, n.sourceId)",
    );
    await session.run(
      "CREATE INDEX entity_chunk IF NOT EXISTS FOR (n:Entity) ON (n.chunkId)",
    );
  } finally {
    await session.close();
  }
}

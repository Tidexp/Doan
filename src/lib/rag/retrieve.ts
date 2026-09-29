import { and, cosineDistance, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks, sources } from "@/lib/db/schema";
import { embedText } from "./embeddings";
import { hasGemini } from "@/lib/env";

export type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  title: string;
  content: string;
  score: number;
  heading?: string;
};

export async function hybridSearch(
  question: string,
  allowedSourceIds: string[],
  topK = 8,
): Promise<RetrievedChunk[]> {
  if (allowedSourceIds.length === 0) return [];

  const lexical = db
    .select({
      chunkId: documentChunks.id,
      sourceId: documentChunks.sourceId,
      title: sources.title,
      content: documentChunks.content,
      heading: sql<string | null>`${documentChunks.metadata}->>'heading'`,
      score: sql<number>`ts_rank(
        to_tsvector('simple', ${documentChunks.content}),
        websearch_to_tsquery('simple', ${question})
      )`,
    })
    .from(documentChunks)
    .innerJoin(sources, eq(sources.id, documentChunks.sourceId))
    .where(
      and(
        inArray(documentChunks.sourceId, allowedSourceIds),
        sql`to_tsvector('simple', ${documentChunks.content}) @@ websearch_to_tsquery('simple', ${question})`,
      ),
    )
    .orderBy(desc(sql`score`))
    .limit(topK);

  let vectorHits: RetrievedChunk[] = [];
  if (hasGemini()) {
    const queryEmbedding = await embedText(question);
    const distance = cosineDistance(
      documentChunks.embedding,
      queryEmbedding,
    );
    const rows = await db
      .select({
        chunkId: documentChunks.id,
        sourceId: documentChunks.sourceId,
        title: sources.title,
        content: documentChunks.content,
        heading: sql<string | null>`${documentChunks.metadata}->>'heading'`,
        distance,
      })
      .from(documentChunks)
      .innerJoin(sources, eq(sources.id, documentChunks.sourceId))
      .where(
        and(
          inArray(documentChunks.sourceId, allowedSourceIds),
          sql`${documentChunks.embedding} IS NOT NULL`,
        ),
      )
      .orderBy(distance)
      .limit(topK);

    vectorHits = rows.map((row) => ({
      chunkId: row.chunkId,
      sourceId: row.sourceId,
      title: row.title,
      content: row.content,
      heading: row.heading ?? undefined,
      score: 1 - Number(row.distance),
    }));
  }

  const lexicalRows = await lexical.catch(() => []);
  const merged = new Map<string, RetrievedChunk>();
  for (const hit of vectorHits) merged.set(hit.chunkId, hit);
  for (const row of lexicalRows) {
    const existing = merged.get(row.chunkId);
    const score = Number(row.score) + (existing?.score ?? 0);
    merged.set(row.chunkId, {
      chunkId: row.chunkId,
      sourceId: row.sourceId,
      title: row.title,
      content: row.content,
      heading: row.heading ?? undefined,
      score,
    });
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function getChunksByIds(ids: string[]): Promise<RetrievedChunk[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      chunkId: documentChunks.id,
      sourceId: documentChunks.sourceId,
      title: sources.title,
      content: documentChunks.content,
      heading: sql<string | null>`${documentChunks.metadata}->>'heading'`,
    })
    .from(documentChunks)
    .innerJoin(sources, eq(sources.id, documentChunks.sourceId))
    .where(inArray(documentChunks.id, ids));

  return rows.map((row) => ({
    ...row,
    heading: row.heading ?? undefined,
    score: 0.5,
  }));
}

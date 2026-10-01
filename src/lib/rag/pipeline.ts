import pLimit from "p-limit";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks } from "@/lib/db/schema";
import { setSourceStatus, timedStep } from "@/lib/db/logger";
import { env, hasGemini, hasNeo4j } from "@/lib/env";
import { ensureGraphIndexes } from "@/lib/graph/client";
import { upsertGraphBatch, type GraphPayload } from "@/lib/graph/queries";
import { detectCrossDocumentConflicts } from "@/lib/graph/cross-document-conflicts";
import { chunkByHeading } from "./chunk";
import { flagNearDuplicates } from "./dedup";
import { embedText } from "./embeddings";
import { extractGraphFromChunk, emptyExtraction } from "./extract";
import { parseDocument } from "./parse";

const INSERT_BATCH = 100;

export async function processSource(sourceId: string) {
  const source = await db.query.sources.findFirst({
    where: (s, { eq: equals }) => equals(s.id, sourceId),
  });
  if (!source) throw new Error(`Source ${sourceId} not found`);

  await setSourceStatus(sourceId, "processing", { errorMessage: null });

  try {
    const parsed = await timedStep(sourceId, "parse", () =>
      parseDocument(source.fileUrl, source.mimeType),
    );

    const chunks = await timedStep(sourceId, "chunk", async () => {
      const result = chunkByHeading(parsed.text);
      if (result.length === 0) {
        throw new Error("No chunks produced from document");
      }
      return result;
    });

    await timedStep(sourceId, "insert_chunks", async () => {
      await db.delete(documentChunks).where(eq(documentChunks.sourceId, sourceId));
      for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
        const slice = chunks.slice(i, i + INSERT_BATCH);
        await db.insert(documentChunks).values(
          slice.map((chunk) => ({
            sourceId,
            content: chunk.content,
            metadata: {
              chunkIndex: chunk.chunkIndex,
              heading: chunk.heading,
              tokenCount: chunk.tokenCount,
            },
          })),
        );
      }
    });

    const stored = await db
      .select({ id: documentChunks.id, content: documentChunks.content })
      .from(documentChunks)
      .where(eq(documentChunks.sourceId, sourceId));

    await setSourceStatus(sourceId, "processing", {
      pageCount: parsed.pageCount ?? null,
      chunkCount: stored.length,
    });

    const concurrency = env().EMBED_CONCURRENCY;
    const limit = pLimit(concurrency);

    const processed = await timedStep(
      sourceId,
      "embed_and_extract",
      () =>
        Promise.all(
          stored.map((chunk) =>
            limit(async () => {
              const [embedding, extraction] = await Promise.all([
                hasGemini() ? embedText(chunk.content) : Promise.resolve(null),
                hasGemini() && hasNeo4j()
                  ? extractGraphFromChunk(chunk.content)
                  : Promise.resolve(emptyExtraction),
              ]);
              return { chunkId: chunk.id, embedding, extraction };
            }),
          ),
        ),
      { chunks: stored.length, concurrency },
    );

    const withVectors = processed.filter((p) => p.embedding);
    if (withVectors.length) {
      await timedStep(sourceId, "update_embeddings", async () => {
        await Promise.all(
          withVectors.map((row) =>
            db
              .update(documentChunks)
              .set({ embedding: row.embedding! })
              .where(eq(documentChunks.id, row.chunkId)),
          ),
        );
      });
    }

    await setSourceStatus(sourceId, "vector_ready");

    const graphPayloads: GraphPayload[] = processed
      .filter(
        (p) =>
          p.extraction.entities.length ||
          p.extraction.relations.length ||
          p.extraction.conflicts.length,
      )
      .map((p) => ({
        sourceId,
        chunkId: p.chunkId,
        ...p.extraction,
      }));

    if (hasNeo4j()) {
      await timedStep(sourceId, "graph_write", async () => {
        await ensureGraphIndexes();
        await upsertGraphBatch(graphPayloads);
      });
      await setSourceStatus(sourceId, "graph_ready");

      // Optional: Detect cross-document conflicts (can be slow/expensive)
      // Enable by setting ENABLE_CROSS_DOCUMENT_CONFLICTS=true in .env
      if (process.env.ENABLE_CROSS_DOCUMENT_CONFLICTS === "true") {
        await timedStep(sourceId, "cross_document_conflicts", async () => {
          await detectCrossDocumentConflicts(sourceId);
        });
      }
    }

    await timedStep(sourceId, "dedup", () => flagNearDuplicates(sourceId));
    await setSourceStatus(sourceId, "completed");
  } catch (error) {
    await setSourceStatus(sourceId, "failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

import pLimit from "p-limit";
import { and, cosineDistance, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks, duplicateFlags } from "@/lib/db/schema";
import { markDuplicateRelation } from "@/lib/graph/queries";

const DUP_THRESHOLD = 0.92;

export async function flagNearDuplicates(sourceId: string) {
  const chunks = await db
    .select({
      id: documentChunks.id,
      embedding: documentChunks.embedding,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.sourceId, sourceId),
        sql`${documentChunks.embedding} IS NOT NULL`,
      ),
    );

  if (chunks.length === 0) return 0;

  const limit = pLimit(6);
  const counts = await Promise.all(
    chunks.map((chunk) =>
      limit(async () => {
        if (!chunk.embedding) return 0;
        const distance = cosineDistance(
          documentChunks.embedding,
          chunk.embedding,
        );
        const hits = await db
          .select({
            id: documentChunks.id,
            sourceId: documentChunks.sourceId,
            distance,
          })
          .from(documentChunks)
          .where(
            and(
              ne(documentChunks.sourceId, sourceId),
              sql`${documentChunks.embedding} IS NOT NULL`,
              sql`1 - (${distance}) > ${DUP_THRESHOLD}`,
            ),
          )
          .limit(5);

        if (hits.length === 0) return 0;

        await db.insert(duplicateFlags).values(
          hits.map((hit) => ({
            leftSourceId: sourceId,
            rightSourceId: hit.sourceId,
            leftChunkId: chunk.id,
            rightChunkId: hit.id,
            similarity: 1 - Number(hit.distance),
          })),
        );

        await Promise.all(
          [...new Set(hits.map((h) => h.sourceId))].map((otherId) =>
            markDuplicateRelation(sourceId, otherId),
          ),
        );
        return hits.length;
      }),
    ),
  );

  return counts.reduce((a, b) => a + b, 0);
}

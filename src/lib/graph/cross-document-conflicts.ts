import { eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks } from "@/lib/db/schema";
import { getNeo4j } from "@/lib/graph/client";
import { extractModel } from "@/lib/llm/gemini";

type DetectedConflict = {
  leftChunkId: string;
  leftSourceId: string;
  leftText: string;
  rightChunkId: string;
  rightSourceId: string;
  rightText: string;
  reason: string;
};

export async function detectCrossDocumentConflicts(
  sourceId: string
): Promise<void> {
  const neo = getNeo4j();
  if (!neo) return;

  // Get all chunks from the newly uploaded document
  const newChunks = await db
    .select({ id: documentChunks.id, content: documentChunks.content })
    .from(documentChunks)
    .where(eq(documentChunks.sourceId, sourceId));

  // Get all chunks from OTHER documents
  const existingChunks = await db
    .select({
      id: documentChunks.id,
      content: documentChunks.content,
      sourceId: documentChunks.sourceId
    })
    .from(documentChunks)
    .where(ne(documentChunks.sourceId, sourceId))
    .limit(100); // Limit for performance

  if (existingChunks.length === 0) return;

  const conflicts: DetectedConflict[] = [];

  // Compare new chunks against existing chunks
  for (const newChunk of newChunks) {
    for (const existingChunk of existingChunks) {
      const prompt = `Compare these two document excerpts and detect ONLY factual conflicts (contradicting values, numbers, dates, names).

Document A:
"""
${newChunk.content.slice(0, 2000)}
"""

Document B:
"""
${existingChunk.content.slice(0, 2000)}
"""

Return JSON only:
{
  "hasConflict": true/false,
  "conflicts": [
    {
      "leftText": "exact quote from A",
      "rightText": "exact quote from B",
      "reason": "what conflicts (e.g., different student ID, different amount)"
    }
  ]
}

If no conflicts, return: {"hasConflict": false, "conflicts": []}`;

      try {
        const result = await extractModel().generateContent(prompt);
        const text = result.response.text();
        const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, ""));

        if (parsed.hasConflict && parsed.conflicts?.length > 0) {
          for (const conflict of parsed.conflicts) {
            conflicts.push({
              leftChunkId: newChunk.id,
              leftSourceId: sourceId,
              leftText: conflict.leftText,
              rightChunkId: existingChunk.id,
              rightSourceId: existingChunk.sourceId,
              rightText: conflict.rightText,
              reason: conflict.reason,
            });
          }
        }
      } catch (error) {
        console.warn("Conflict detection failed:", error);
      }
    }
  }

  // Store detected conflicts in Neo4j
  if (conflicts.length > 0) {
    const session = neo.session();
    try {
      await session.run(
        `
        UNWIND $conflicts AS conflict
        MERGE (a:Entity {
          canonicalLabel: toLower(conflict.leftText),
          sourceId: conflict.leftSourceId,
          chunkId: conflict.leftChunkId
        })
        SET a.label = conflict.leftText, a.type = 'CLAIM'
        MERGE (b:Entity {
          canonicalLabel: toLower(conflict.rightText),
          sourceId: conflict.rightSourceId,
          chunkId: conflict.rightChunkId
        })
        SET b.label = conflict.rightText, b.type = 'CLAIM'
        MERGE (a)-[r:CONFLICTS_WITH]->(b)
        SET r.reason = conflict.reason
        `,
        { conflicts }
      );
      console.log(`✓ Stored ${conflicts.length} cross-document conflicts`);
    } finally {
      await session.close();
    }
  }
}

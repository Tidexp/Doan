import neo4j from "neo4j-driver";
import { getNeo4j } from "./client";
import type {
  ExtractedConflict,
  ExtractedEntity,
  ExtractedRelation,
} from "@/lib/rag/extract";

export type GraphPayload = {
  sourceId: string;
  chunkId: string;
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  conflicts: ExtractedConflict[];
};

export async function upsertGraphBatch(payloads: GraphPayload[]) {
  const neo = getNeo4j();
  if (!neo || payloads.length === 0) return;

  const session = neo.session();
  try {
    const entities = payloads.flatMap((p) =>
      p.entities.map((e) => ({
        canonicalLabel: e.canonicalLabel,
        label: e.label,
        type: e.type,
        sourceId: p.sourceId,
        chunkId: p.chunkId,
      })),
    );
    const relations = payloads.flatMap((p) =>
      p.relations.map((r) => ({
        from: r.from,
        to: r.to,
        predicate: r.predicate,
        sourceId: p.sourceId,
        chunkId: p.chunkId,
      })),
    );
    const conflicts = payloads.flatMap((p) =>
      p.conflicts.map((c) => ({
        left: c.left,
        right: c.right,
        reason: c.reason,
        sourceId: p.sourceId,
        chunkId: p.chunkId,
      })),
    );

    // UNWIND batch writes — never insert one node per round-trip.
    if (entities.length) {
      await session.run(
        `
        UNWIND $rows AS row
        MERGE (e:Entity {canonicalLabel: row.canonicalLabel, sourceId: row.sourceId, chunkId: row.chunkId})
        SET e.label = row.label, e.type = row.type
        `,
        { rows: entities },
      );
    }

    if (relations.length) {
      await session.run(
        `
        UNWIND $rows AS row
        MATCH (a:Entity {canonicalLabel: row.from, sourceId: row.sourceId, chunkId: row.chunkId})
        MATCH (b:Entity {canonicalLabel: row.to, sourceId: row.sourceId, chunkId: row.chunkId})
        MERGE (a)-[r:RELATES_TO {predicate: row.predicate}]->(b)
        `,
        { rows: relations },
      );
    }

    const coOccurs = payloads.flatMap((p) => {
      const labels = p.entities.map((e) => e.canonicalLabel).slice(0, 15);
      const pairs: Array<{
        from: string;
        to: string;
        sourceId: string;
        chunkId: string;
      }> = [];
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          pairs.push({
            from: labels[i],
            to: labels[j],
            sourceId: p.sourceId,
            chunkId: p.chunkId,
          });
        }
      }
      return pairs;
    });

    if (coOccurs.length) {
      await session.run(
        `
        UNWIND $rows AS row
        MATCH (a:Entity {canonicalLabel: row.from, sourceId: row.sourceId, chunkId: row.chunkId})
        MATCH (b:Entity {canonicalLabel: row.to, sourceId: row.sourceId, chunkId: row.chunkId})
        MERGE (a)-[:RELATES_TO {predicate: "co_occurs"}]->(b)
        `,
        { rows: coOccurs },
      );
    }

    if (conflicts.length) {
      await session.run(
        `
        UNWIND $rows AS row
        MERGE (a:Entity {canonicalLabel: toLower(row.left), sourceId: row.sourceId, chunkId: row.chunkId})
        MERGE (b:Entity {canonicalLabel: toLower(row.right), sourceId: row.sourceId, chunkId: row.chunkId})
        MERGE (a)-[r:CONFLICTS_WITH]->(b)
        SET r.reason = row.reason
        `,
        { rows: conflicts },
      );
    }
  } finally {
    await session.close();
  }
}

export async function markDuplicateRelation(
  leftSourceId: string,
  rightSourceId: string,
) {
  const neo = getNeo4j();
  if (!neo) return;
  const session = neo.session();
  try {
    await session.run(
      `
      MATCH (a:Entity {sourceId: $left})
      MATCH (b:Entity {sourceId: $right})
      WHERE a.canonicalLabel = b.canonicalLabel
      MERGE (a)-[:DUPLICATE_OF]->(b)
      `,
      { left: leftSourceId, right: rightSourceId },
    );
  } finally {
    await session.close();
  }
}

export type GraphHit = {
  chunkId: string;
  sourceId: string;
  entity: string;
  hops: number;
};

export async function traverseRelatedChunks(
  terms: string[],
  allowedSourceIds: string[],
  limit = 12,
): Promise<GraphHit[]> {
  const neo = getNeo4j();
  if (!neo || terms.length === 0 || allowedSourceIds.length === 0) return [];
  const session = neo.session();
  try {
    const result = await session.run(
      `
      UNWIND $terms AS term
      MATCH (start:Entity)
      WHERE start.canonicalLabel CONTAINS toLower(term)
        AND start.sourceId IN $allowed
      MATCH path = (start)-[:RELATES_TO|CONFLICTS_WITH*1..2]-(related:Entity)
      WHERE related.sourceId IN $allowed
      RETURN DISTINCT related.chunkId AS chunkId,
                      related.sourceId AS sourceId,
                      related.label AS entity,
                      length(path) AS hops
      LIMIT $limit
      `,
      { terms, allowed: allowedSourceIds, limit: neo4j.int(limit) },
    );
    return result.records.map((record) => ({
      chunkId: record.get("chunkId") as string,
      sourceId: record.get("sourceId") as string,
      entity: record.get("entity") as string,
      hops: Number(record.get("hops")),
    }));
  } finally {
    await session.close();
  }
}

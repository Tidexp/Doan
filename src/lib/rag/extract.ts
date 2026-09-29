import pLimit from "p-limit";
import { env } from "@/lib/env";
import { extractModel, parseJsonObject } from "@/lib/llm/gemini";

export type ExtractedEntity = {
  label: string;
  canonicalLabel: string;
  type: string;
};

export type ExtractedRelation = {
  from: string;
  to: string;
  predicate: string;
};

export type ExtractedConflict = {
  left: string;
  right: string;
  reason: string;
};

export type ExtractionResult = {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  conflicts: ExtractedConflict[];
};

function canonicalize(label: string) {
  return label
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const EMPTY: ExtractionResult = {
  entities: [],
  relations: [],
  conflicts: [],
};

export async function extractGraphFromChunk(
  content: string,
): Promise<ExtractionResult> {
  const prompt = `Extract entities and relations from the enterprise document chunk.
Return JSON only:
{
  "entities": [{"label":"...", "type":"PERSON|ORG|POLICY|CONCEPT|SYSTEM|PLACE|OTHER"}],
  "relations": [{"from":"entity label", "to":"entity label", "predicate":"short verb phrase"}],
  "conflicts": [{"left":"claim A", "right":"claim B", "reason":"why they conflict"}]
}
Rules:
- Max 15 entities.
- Prefer domain terms, policies, systems, people, departments.
- Relations must use entity labels that appear in entities.
Chunk:
"""${content.slice(0, 6000)}"""`;

  const result = await extractModel().generateContent(prompt);
  const text = result.response.text();
  const parsed = parseJsonObject<{
    entities?: Array<{ label?: string; type?: string }>;
    relations?: Array<{ from?: string; to?: string; predicate?: string }>;
    conflicts?: Array<{ left?: string; right?: string; reason?: string }>;
  }>(text);

  const entities = (parsed.entities ?? [])
    .slice(0, 15)
    .map((e) => {
      const label = (e.label ?? "").trim();
      return {
        label,
        canonicalLabel: canonicalize(label),
        type: (e.type ?? "OTHER").toUpperCase(),
      };
    })
    .filter((e) => e.canonicalLabel.length > 1);

  const known = new Set(entities.map((e) => e.canonicalLabel));
  const relations = (parsed.relations ?? [])
    .map((r) => ({
      from: canonicalize(r.from ?? ""),
      to: canonicalize(r.to ?? ""),
      predicate: (r.predicate ?? "related_to").trim().toLowerCase(),
    }))
    .filter((r) => r.from && r.to && r.from !== r.to && known.has(r.from) && known.has(r.to));

  const conflicts = (parsed.conflicts ?? [])
    .map((c) => ({
      left: (c.left ?? "").trim(),
      right: (c.right ?? "").trim(),
      reason: (c.reason ?? "").trim(),
    }))
    .filter((c) => c.left && c.right);

  return { entities, relations, conflicts };
}

export async function extractMany(
  contents: string[],
): Promise<ExtractionResult[]> {
  const limit = pLimit(env().EXTRACT_CONCURRENCY);
  return Promise.all(
    contents.map((content) => limit(() => extractGraphFromChunk(content))),
  );
}

export { EMPTY as emptyExtraction };

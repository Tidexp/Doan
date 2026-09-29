import { eq } from "drizzle-orm";
import { db } from "./index";
import { processingLogs, sources } from "./schema";

export async function timedStep<T>(
  sourceId: string,
  step: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>,
): Promise<T> {
  const label = `pipeline:${sourceId}:${step}`;
  const started = performance.now();
  console.time(label);
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - started);
    console.timeEnd(label);
    await db.insert(processingLogs).values({
      sourceId,
      step,
      durationMs,
      ok: true,
      detail: extra ?? null,
    });
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    console.timeEnd(label);
    await db.insert(processingLogs).values({
      sourceId,
      step,
      durationMs,
      ok: false,
      detail: {
        ...extra,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function setSourceStatus(
  sourceId: string,
  status: (typeof sources.$inferInsert)["status"],
  patch?: Partial<typeof sources.$inferInsert>,
) {
  await db
    .update(sources)
    .set({ status, updatedAt: new Date(), ...patch })
    .where(eq(sources.id, sourceId));
}

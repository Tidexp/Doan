import { Queue } from "bullmq";
import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
  documentQueue: Queue | undefined;
};

export function getRedis() {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return globalForRedis.redis;
}

export const DOCUMENT_QUEUE = "document-pipeline";

export function getDocumentQueue() {
  if (!globalForRedis.documentQueue) {
    globalForRedis.documentQueue = new Queue(DOCUMENT_QUEUE, {
      connection: getRedis(),
    });
  }
  return globalForRedis.documentQueue;
}

export async function enqueueDocumentJob(sourceId: string) {
  // API returns immediately after this call; heavy extraction stays in the worker.
  await getDocumentQueue().add(
    "process-source",
    { sourceId },
    {
      jobId: sourceId,
      attempts: 2,
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  );
}

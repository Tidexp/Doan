import { Worker } from "bullmq";
import { DOCUMENT_QUEUE, getRedis } from "./queues";
import { processSource } from "@/lib/rag/pipeline";

export function startDocumentWorker() {
  const worker = new Worker(
    DOCUMENT_QUEUE,
    async (job) => {
      const sourceId = String(job.data.sourceId);
      console.time(`job:${sourceId}`);
      try {
        await processSource(sourceId);
      } finally {
        console.timeEnd(`job:${sourceId}`);
      }
    },
    {
      connection: getRedis(),
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    console.error("Document job failed", job?.id, err);
  });

  worker.on("completed", (job) => {
    console.log("Document job completed", job.id);
  });

  return worker;
}

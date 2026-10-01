import { Worker } from "bullmq";
import { DOCUMENT_QUEUE, getRedis } from "./queues";
import { processSource } from "@/lib/rag/pipeline";

export function startDocumentWorker() {
  console.log("Connecting to Redis...");

  const worker = new Worker(
    DOCUMENT_QUEUE,
    async (job) => {
      const sourceId = String(job.data.sourceId);
      console.log(`Processing document: ${sourceId}`);
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

  worker.on("ready", () => {
    console.log("✓ Worker connected to Redis");
    console.log("✓ Listening for jobs on queue:", DOCUMENT_QUEUE);
    console.log("✓ Ready to process documents!");
  });

  worker.on("failed", (job, err) => {
    console.error("✗ Document job failed:", job?.id, err.message);
  });

  worker.on("completed", (job) => {
    console.log("✓ Document job completed:", job.id);
  });

  worker.on("error", (err) => {
    console.error("✗ Worker error:", err.message);
  });

  return worker;
}

import "dotenv/config"; // Load .env file
import { startDocumentWorker } from "./lib/queue/worker";

console.log("Starting Knowledge OS document worker...");
startDocumentWorker();

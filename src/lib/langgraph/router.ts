import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { hasGemini, hasNeo4j } from "@/lib/env";
import { traverseRelatedChunks } from "@/lib/graph/queries";
import { generateAnswer, type Citation } from "@/lib/rag/generate";
import {
  getChunksByIds,
  hybridSearch,
  type RetrievedChunk,
} from "@/lib/rag/retrieve";

export type RagRoute = "vector" | "graph" | "hybrid";

const RagState = Annotation.Root({
  question: Annotation<string>(),
  allowedSourceIds: Annotation<string[]>(),
  route: Annotation<RagRoute>(),
  chunks: Annotation<RetrievedChunk[]>(),
  answer: Annotation<string>(),
  citations: Annotation<Citation[]>(),
});

function classifyRoute(question: string): RagRoute {
  const q = question.toLowerCase();
  const graphHints =
    /liên quan|so sánh|mối quan hệ|những .+ nào|ai chịu trách nhiệm|phụ thuộc|mâu thuẫn|trùng lặp/.test(
      q,
    );
  const factualHints = /là gì|định nghĩa|theo tài liệu|nêu|tóm tắt/.test(q);
  if (graphHints && hasNeo4j()) return "hybrid";
  if (factualHints) return "vector";
  return hasNeo4j() ? "hybrid" : "vector";
}

async function routeNode(state: typeof RagState.State) {
  return { route: classifyRoute(state.question) };
}

async function retrieveNode(state: typeof RagState.State) {
  const runVector = state.route !== "graph";
  const runGraph = state.route !== "vector" && hasNeo4j();

  const [vectorChunks, graphChunks] = await Promise.all([
    runVector
      ? hybridSearch(state.question, state.allowedSourceIds, 8)
      : Promise.resolve([] as RetrievedChunk[]),
    runGraph
      ? (async () => {
          const terms = state.question
            .split(/[\s,.;:!?]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 3)
            .slice(0, 8);
          const hits = await traverseRelatedChunks(
            terms,
            state.allowedSourceIds,
            12,
          );
          return getChunksByIds([...new Set(hits.map((h) => h.chunkId))]);
        })()
      : Promise.resolve([] as RetrievedChunk[]),
  ]);

  const map = new Map<string, RetrievedChunk>();
  for (const chunk of [...vectorChunks, ...graphChunks]) {
    const prev = map.get(chunk.chunkId);
    if (!prev || chunk.score > prev.score) map.set(chunk.chunkId, chunk);
  }
  return {
    chunks: [...map.values()].sort((a, b) => b.score - a.score).slice(0, 10),
  };
}

async function answerNode(state: typeof RagState.State) {
  if (!hasGemini()) {
    const snippets = state.chunks
      .map((c, i) => `[#${i + 1}] ${c.title}: ${c.content.slice(0, 280)}`)
      .join("\n\n");
    return {
      answer: snippets
        ? `Chưa cấu hình GEMINI_API_KEY. Đây là các đoạn liên quan nhất:\n\n${snippets}`
        : "Không có ngữ cảnh. Hãy nạp tài liệu và cấu hình GEMINI_API_KEY.",
      citations: state.chunks.slice(0, 6).map((chunk) => ({
        sourceId: chunk.sourceId,
        chunkId: chunk.chunkId,
        title: chunk.title,
        snippet: chunk.content.slice(0, 240),
      })),
    };
  }

  return generateAnswer(state.question, state.chunks, state.route);
}

const compiled = new StateGraph(RagState)
  .addNode("route", routeNode)
  .addNode("retrieve", retrieveNode)
  .addNode("answer", answerNode)
  .addEdge(START, "route")
  .addEdge("route", "retrieve")
  .addEdge("retrieve", "answer")
  .addEdge("answer", END)
  .compile();

export async function runRag(input: {
  question: string;
  allowedSourceIds: string[];
}) {
  const result = await compiled.invoke({
    question: input.question,
    allowedSourceIds: input.allowedSourceIds,
    route: "vector",
    chunks: [],
    answer: "",
    citations: [],
  });
  return {
    answer: result.answer,
    citations: result.citations,
    route: result.route,
  };
}

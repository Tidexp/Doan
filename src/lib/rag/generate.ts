import { answerModel } from "@/lib/llm/gemini";
import type { RetrievedChunk } from "./retrieve";

export type Citation = {
  sourceId: string;
  chunkId: string;
  title: string;
  snippet: string;
};

export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
  route: string,
) {
  if (chunks.length === 0) {
    return {
      answer:
        "Không tìm thấy tài liệu phù hợp trong phạm vi quyền truy cập của bạn.",
      citations: [] as Citation[],
    };
  }

  const context = chunks
    .map(
      (chunk, i) =>
        `[#${i + 1} source=${chunk.sourceId} chunk=${chunk.chunkId} title="${chunk.title}"]\n${chunk.content}`,
    )
    .join("\n\n");

  const prompt = `Bạn là trợ lý tri thức doanh nghiệp. Trả lời bằng tiếng Việt, chỉ dựa trên ngữ cảnh.
Nếu không đủ thông tin, hãy nói rõ. Mỗi khẳng định quan trọng phải kèm trích dẫn dạng [#n].
Đường truy hồi: ${route}

Câu hỏi: ${question}

Ngữ cảnh:
${context}`;

  const result = await answerModel().generateContent(prompt);
  const answer = result.response.text();

  const usedIndexes = new Set(
    [...answer.matchAll(/\[#(\d+)\]/g)].map((m) => Number(m[1]) - 1),
  );
  const citations: Citation[] = chunks
    .filter((_, i) => usedIndexes.size === 0 || usedIndexes.has(i))
    .slice(0, 6)
    .map((chunk) => ({
      sourceId: chunk.sourceId,
      chunkId: chunk.chunkId,
      title: chunk.title,
      snippet: chunk.content.slice(0, 240),
    }));

  return { answer, citations };
}

"use client";

import { FormEvent, useState } from "react";

type Citation = {
  sourceId: string;
  chunkId: string;
  title: string;
  snippet: string;
};

type ChatItem = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  route?: string;
};

export default function ChatPage() {
  const [question, setQuestion] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    setItems((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, conversationId }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setItems((prev) => [
        ...prev,
        { role: "assistant", content: json.error ?? "Không trả lời được." },
      ]);
      return;
    }
    setConversationId(json.conversationId);
    setItems((prev) => [
      ...prev,
      {
        role: "assistant",
        content: json.answer,
        citations: json.citations,
        route: json.route,
      },
    ]);
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="px-8 py-5 border-b border-[var(--line)]">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Hỏi đáp có trích dẫn
        </p>
        <h2 className="text-2xl font-semibold">Notebook tri thức nội bộ</h2>
      </header>
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        {items.length === 0 ? (
          <p className="text-[var(--muted)] max-w-xl">
            Đặt câu hỏi về chính sách, quy trình hoặc hệ thống. Câu hỏi quan hệ
            sẽ đi graph path; câu hỏi sự kiện đi vector path.
          </p>
        ) : null}
        {items.map((item, i) => (
          <div
            key={i}
            className={
              item.role === "user"
                ? "ml-auto max-w-2xl bg-[#18231c] text-white rounded-2xl px-4 py-3"
                : "max-w-3xl bg-white border border-[var(--line)] rounded-2xl px-4 py-3"
            }
          >
            <p className="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
            {item.route ? (
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)] mt-2">
                route: {item.route}
              </p>
            ) : null}
            {item.citations?.length ? (
              <div className="mt-3 grid gap-2">
                {item.citations.map((c) => (
                  <a
                    key={c.chunkId}
                    href={`/documents/${c.sourceId}`}
                    className="block text-xs border border-[var(--line)] rounded-lg p-2 hover:bg-[#f7f1e4]"
                  >
                    <span className="font-medium">{c.title}</span>
                    <span className="block text-[var(--muted)] mt-1">
                      {c.snippet}
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Đang truy hồi tài liệu...</p>
        ) : null}
      </div>
      <form
        onSubmit={onSubmit}
        className="p-6 border-t border-[var(--line)] bg-[var(--bg-elev)]"
      >
        <div className="max-w-3xl flex gap-3">
          <input
            className="flex-1 rounded-xl border border-[var(--line)] px-4 py-3"
            placeholder="Hỏi về tài liệu bạn được phép xem..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button className="rounded-xl bg-[var(--accent)] text-white px-5">
            Gửi
          </button>
        </div>
      </form>
    </div>
  );
}

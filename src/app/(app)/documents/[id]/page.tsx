"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Detail = {
  source: {
    title: string;
    status: string;
    pageCount: number | null;
    chunkCount: number | null;
    errorMessage: string | null;
  };
  chunks: Array<{ id: string; content: string; metadata: { heading?: string } }>;
  logs: Array<{
    id: string;
    step: string;
    durationMs: number;
    ok: boolean;
    createdAt: string;
  }>;
};

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);

  useEffect(() => {
    fetch(`/api/documents/${params.id}`)
      .then((r) => r.json())
      .then(setData);
  }, [params.id]);

  if (!data?.source) return <div className="p-8">Đang tải...</div>;

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-3xl font-semibold">{data.source.title}</h2>
      <p className="text-[var(--muted)] mt-1 mb-6">
        {data.source.status} · {data.source.pageCount ?? "?"} trang ·{" "}
        {data.source.chunkCount ?? 0} chunks
      </p>
      {data.source.errorMessage ? (
        <p className="text-[var(--danger)] mb-4">{data.source.errorMessage}</p>
      ) : null}

      <h3 className="font-medium mb-2">Nhật ký xử lý</h3>
      <div className="bg-white border border-[var(--line)] rounded-xl mb-8 overflow-hidden">
        {data.logs.map((log) => (
          <div
            key={log.id}
            className="flex justify-between px-4 py-2 border-b border-[var(--line)] text-sm"
          >
            <span>
              {log.step} {log.ok ? "" : "(lỗi)"}
            </span>
            <span className="font-mono">{log.durationMs}ms</span>
          </div>
        ))}
      </div>

      <h3 className="font-medium mb-2">Chunks</h3>
      <div className="space-y-3">
        {data.chunks.map((chunk) => (
          <article
            key={chunk.id}
            className="bg-white border border-[var(--line)] rounded-xl p-4 text-sm whitespace-pre-wrap"
          >
            {chunk.metadata?.heading ? (
              <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-2">
                {chunk.metadata.heading}
              </p>
            ) : null}
            {chunk.content}
          </article>
        ))}
      </div>
    </div>
  );
}

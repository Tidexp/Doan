"use client";

import { useEffect, useState } from "react";

type AdminPayload = {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    departmentName: string | null;
  }>;
  departments: Array<{ id: string; name: string; slug: string }>;
  logs: Array<{ id: string; step: string; durationMs: number; ok: boolean }>;
  duplicates: Array<{
    id: string;
    leftSourceId: string;
    rightSourceId: string;
    similarity: number;
  }>;
  sources: Array<{
    id: string;
    title: string;
    status: string;
    chunkCount: number | null;
  }>;
};

export default function AdminPage() {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Forbidden");
        setData(json);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="p-8">{error}</div>;
  if (!data) return <div className="p-8">Đang tải...</div>;

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Phân quyền
        </p>
        <h2 className="text-3xl font-semibold mt-1">Quản trị</h2>
      </div>

      <section>
        <h3 className="font-medium mb-3">Người dùng</h3>
        <div className="bg-white border border-[var(--line)] rounded-2xl overflow-hidden">
          {data.users.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-4 px-4 py-2 border-b border-[var(--line)] text-sm"
            >
              <span>{user.name}</span>
              <span>{user.email}</span>
              <span>{user.role}</span>
              <span>{user.departmentName ?? "—"}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-medium mb-3">Phòng ban</h3>
        <div className="flex flex-wrap gap-2">
          {data.departments.map((d) => (
            <span
              key={d.id}
              className="rounded-full bg-white border border-[var(--line)] px-3 py-1 text-sm"
            >
              {d.name}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-medium mb-3">Cờ trùng lặp</h3>
        <div className="bg-white border border-[var(--line)] rounded-2xl overflow-hidden">
          {data.duplicates.length === 0 ? (
            <p className="px-4 py-4 text-sm text-[var(--muted)]">
              Chưa phát hiện near-duplicate.
            </p>
          ) : (
            data.duplicates.map((d) => (
              <div
                key={d.id}
                className="px-4 py-2 border-b border-[var(--line)] text-sm"
              >
                {d.leftSourceId.slice(0, 8)} ↔ {d.rightSourceId.slice(0, 8)} ·{" "}
                {(d.similarity * 100).toFixed(1)}%
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SourceRow = {
  id: string;
  title: string;
  status: string;
  mimeType: string;
  pageCount: number | null;
  chunkCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  departmentName: string | null;
  uploaderName: string | null;
};

type Dept = { id: string; name: string };

const statusLabel: Record<string, string> = {
  queued: "Trong hàng đợi",
  processing: "Đang xử lý",
  vector_ready: "Vector sẵn sàng",
  graph_ready: "Graph sẵn sàng",
  completed: "Hoàn tất",
  failed: "Lỗi",
};

export default function DocumentsPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [docs, deps] = await Promise.all([
      fetch("/api/documents").then((r) => r.json()),
      fetch("/api/departments").then((r) => r.json()),
    ]);
    setSources(docs.sources ?? []);
    setDepartments(deps.departments ?? []);
    if (!departmentId && deps.departments?.[0]) {
      setDepartmentId(deps.departments[0].id);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    return sources.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [sources]);

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fileInput = formEl.elements.namedItem("file") as HTMLInputElement;
    if (!fileInput.files?.[0]) return;
    const data = new FormData();
    data.set("file", fileInput.files[0]);
    data.set("departmentId", departmentId);
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/documents", { method: "POST", body: data });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "Upload thất bại");
      return;
    }
    setMessage(`Đã nhận file. Job đưa vào queue sau ${json.elapsedMs}ms.`);
    formEl.reset();
    load();
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Kho tài liệu
          </p>
          <h2 className="text-3xl font-semibold mt-1">Tài liệu doanh nghiệp</h2>
        </div>
        <div className="flex gap-2 text-xs">
          {Object.entries(counts).map(([k, v]) => (
            <span
              key={k}
              className="rounded-full border border-[var(--line)] px-3 py-1 bg-white"
            >
              {statusLabel[k] ?? k}: {v}
            </span>
          ))}
        </div>
      </div>

      <form
        onSubmit={onUpload}
        className="bg-[var(--bg-elev)] border border-dashed border-[var(--line)] rounded-2xl p-6 mb-8"
      >
        <p className="font-medium mb-3">Tải lên PDF / DOCX / Markdown</p>
        <div className="flex flex-wrap gap-3 items-center">
          <input name="file" type="file" accept=".pdf,.docx,.md,.txt" required />
          <select
            className="rounded-lg border border-[var(--line)] px-3 py-2 bg-white"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            disabled={busy}
            className="rounded-lg bg-[var(--accent)] text-white px-4 py-2 disabled:opacity-60"
          >
            {busy ? "Đang gửi..." : "Đưa vào hàng đợi"}
          </button>
        </div>
        <p className="text-sm text-[var(--muted)] mt-3">
          API chỉ lưu file thô rồi enqueue BullMQ — không chờ extraction.
        </p>
        {message ? <p className="text-sm mt-2">{message}</p> : null}
      </form>

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#efe8d8] text-left">
            <tr>
              <th className="px-4 py-3">Tài liệu</th>
              <th className="px-4 py-3">Phòng ban</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Chunks</th>
              <th className="px-4 py-3">Người tải</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">
                  <a className="font-medium underline" href={`/documents/${row.id}`}>
                    {row.title}
                  </a>
                </td>
                <td className="px-4 py-3">{row.departmentName ?? "—"}</td>
                <td className="px-4 py-3">
                  {statusLabel[row.status] ?? row.status}
                  {row.errorMessage ? (
                    <span className="block text-[var(--danger)] text-xs">
                      {row.errorMessage}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{row.chunkCount ?? 0}</td>
                <td className="px-4 py-3">{row.uploaderName ?? "—"}</td>
              </tr>
            ))}
            {sources.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={5}>
                  Chưa có tài liệu trong phạm vi quyền của bạn.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

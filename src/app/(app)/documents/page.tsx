"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Trash2, Search, AlertCircle, CheckSquare, Square } from "lucide-react";

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

type UserSession = {
  id: string;
  role: "admin" | "manager" | "employee" | "guest";
  name: string;
};

const statusLabel: Record<string, string> = {
  queued: "Trong hàng đợi",
  processing: "Đang xử lý",
  vector_ready: "Vector sẵn sàng",
  graph_ready: "Graph sẵn sàng",
  completed: "Hoàn tất",
  failed: "Lỗi",
};

const PAGE_SIZE = 20;

export default function DocumentsPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function load() {
    const [docs, deps, session] = await Promise.all([
      fetch("/api/documents").then((r) => r.json()),
      fetch("/api/departments").then((r) => r.json()),
      fetch("/api/auth/session").then((r) => r.json()),
    ]);
    setSources(docs.sources ?? []);
    setDepartments(deps.departments ?? []);
    setCurrentUser(session?.user ?? null);
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

  const filteredSources = useMemo(() => {
    if (!searchQuery) return sources;
    const q = searchQuery.toLowerCase();
    return sources.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.departmentName?.toLowerCase().includes(q) ||
        s.uploaderName?.toLowerCase().includes(q)
    );
  }, [sources, searchQuery]);

  const paginatedSources = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSources.slice(start, start + PAGE_SIZE);
  }, [filteredSources, currentPage]);

  const totalPages = Math.ceil(filteredSources.length / PAGE_SIZE);
  const errorDocuments = sources.filter((s) => s.status === "failed");

  const canUpload = currentUser && currentUser.role !== "guest";
  const isAdmin = currentUser?.role === "admin";

  const canDeleteSelected = useMemo(() => {
    if (!currentUser || selectedIds.size === 0) return false;
    if (isAdmin) return true;
    // Check if all selected documents are uploaded by current user
    return [...selectedIds].every((id) => {
      const doc = sources.find((s) => s.id === id);
      return doc && doc.uploaderName === currentUser.name;
    });
  }, [selectedIds, sources, currentUser, isAdmin]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedSources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedSources.map((s) => s.id)));
    }
  };

  const isAllSelected = paginatedSources.length > 0 && selectedIds.size === paginatedSources.length;

  function formatTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Vừa xong";
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;

    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

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

  async function onDelete(id: string, title: string) {
    if (!confirm(`Xác nhận xóa tài liệu "${title}"?\n\nHành động này không thể hoàn tác.`)) {
      return;
    }
    setBusy(true);
    setMessage("");
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "Xóa thất bại");
      return;
    }
    setMessage(`Đã xóa "${title}"`);
    load();
  }

  async function onDeleteAllErrors() {
    if (errorDocuments.length === 0) return;

    if (!confirm(`Xác nhận xóa ${errorDocuments.length} tài liệu lỗi?\n\nHành động này không thể hoàn tác.`)) {
      return;
    }

    setBusy(true);
    setMessage("");

    const results = await Promise.allSettled(
      errorDocuments.map((doc) =>
        fetch(`/api/documents/${doc.id}`, { method: "DELETE" })
      )
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    setBusy(false);

    if (failed > 0) {
      setMessage(`Đã xóa ${errorDocuments.length - failed}/${errorDocuments.length} tài liệu lỗi. ${failed} thất bại.`);
    } else {
      setMessage(`Đã xóa ${errorDocuments.length} tài liệu lỗi thành công.`);
    }

    load();
  }

  async function onDeleteSelected() {
    if (selectedIds.size === 0) return;

    if (!confirm(`Xác nhận xóa ${selectedIds.size} tài liệu đã chọn?\n\nHành động này không thể hoàn tác.`)) {
      return;
    }

    setBusy(true);
    setMessage("");

    const results = await Promise.allSettled(
      [...selectedIds].map((id) =>
        fetch(`/api/documents/${id}`, { method: "DELETE" })
      )
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    setBusy(false);
    setSelectedIds(new Set());

    if (failed > 0) {
      setMessage(`Đã xóa ${selectedIds.size - failed}/${selectedIds.size} tài liệu. ${failed} thất bại.`);
    } else {
      setMessage(`Đã xóa ${selectedIds.size} tài liệu thành công.`);
    }

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

      {/* Search and Bulk Actions */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Tìm kiếm tài liệu, phòng ban, người tải..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-[var(--line)] rounded-lg"
          />
        </div>
        {selectedIds.size > 0 && canDeleteSelected && (
          <button
            onClick={onDeleteSelected}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 size={18} />
            Xóa {selectedIds.size} tài liệu
          </button>
        )}
        {isAdmin && errorDocuments.length > 0 && (
          <button
            onClick={onDeleteAllErrors}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
          >
            <AlertCircle size={18} />
            Xóa {errorDocuments.length} tài liệu lỗi
          </button>
        )}
      </div>

      {canUpload ? (
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
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 mb-8 text-sm text-yellow-800">
          ⚠️ Tài khoản khách không có quyền tải lên tài liệu.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#efe8d8] text-left">
            <tr>
              <th className="px-4 py-3 w-12">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center justify-center"
                  title={isAllSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                >
                  {isAllSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
              </th>
              <th className="px-4 py-3">Tài liệu</th>
              <th className="px-4 py-3">Phòng ban</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Chunks</th>
              <th className="px-4 py-3">Người tải</th>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {paginatedSources.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleSelection(row.id)}
                    className="flex items-center justify-center"
                  >
                    {selectedIds.has(row.id) ? (
                      <CheckSquare size={18} className="text-blue-600" />
                    ) : (
                      <Square size={18} className="text-gray-400" />
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <a className="font-medium underline" href={`/documents/${row.id}`}>
                    {row.title}
                  </a>
                </td>
                <td className="px-4 py-3">{row.departmentName ?? "—"}</td>
                <td className="px-4 py-3">
                  {statusLabel[row.status] ?? row.status}
                  {row.errorMessage ? (
                    <span
                      className="block text-[var(--danger)] text-xs max-w-[200px] truncate"
                      title={row.errorMessage}
                    >
                      {row.errorMessage}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{row.chunkCount ?? 0}</td>
                <td className="px-4 py-3">{row.uploaderName ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-gray-600" title={new Date(row.createdAt).toLocaleString("vi-VN")}>
                  {formatTimeAgo(row.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  {(isAdmin || row.uploaderName === currentUser?.name) ? (
                    <button
                      onClick={() => onDelete(row.id, row.title)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
                      title="Xóa tài liệu"
                    >
                      <Trash2 size={16} />
                      Xóa
                    </button>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
            {paginatedSources.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-[var(--muted)]" colSpan={8}>
                  {searchQuery
                    ? `Không tìm thấy tài liệu phù hợp với "${searchQuery}"`
                    : "Chưa có tài liệu trong phạm vi quyền của bạn."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-[var(--line)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Trước
          </button>
          <span className="text-sm text-[var(--muted)]">
            Trang {currentPage} / {totalPages} ({filteredSources.length} tài liệu)
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border border-[var(--line)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
}

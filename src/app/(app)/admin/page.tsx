"use client";

import { FormEvent, useEffect, useState } from "react";

type Role = "admin" | "manager" | "employee" | "guest";
type LoginMethod = "google" | "password";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  departmentId: string | null;
  departmentName: string | null;
};

type Department = { id: string; name: string; slug: string };

type AdminPayload = {
  users: AdminUser[];
  departments: Department[];
  duplicates: Array<{
    id: string;
    leftSourceId: string;
    rightSourceId: string;
    similarity: number;
  }>;
};

type RosterImportRow = {
  line: number;
  name: string;
  email: string;
  role: Role;
  status: "ready" | "invalid" | "exists" | "duplicate" | "imported";
  message: string;
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Quản trị",
  manager: "Quản lý",
  employee: "Nhân viên",
  guest: "Khách",
};

export default function AdminPage() {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("google");
  const [departmentId, setDepartmentId] = useState("");
  const [password, setPassword] = useState("");

  const [deptName, setDeptName] = useState("");
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [rosterRows, setRosterRows] = useState<RosterImportRow[]>([]);
  const [rosterReadyCount, setRosterReadyCount] = useState(0);

  async function load() {
    const r = await fetch("/api/admin");
    const json = await r.json();
    if (!r.ok) throw new Error(json.error ?? "Forbidden");
    setData(json);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        role,
        departmentId: departmentId || null,
        loginMethod,
        ...(loginMethod === "password" && password ? { password } : {}),
      }),
    });
    const json = await r.json();
    setSaving(false);
    if (!r.ok) {
      setError(json.error ?? "Không tạo được tài khoản.");
      return;
    }
    setNotice(
      json.tempPassword
        ? `Đã tạo ${json.user.email}. Mật khẩu tạm: ${json.tempPassword} (gửi cho nhân viên, chỉ hiện một lần).`
        : `Đã tạo ${json.user.email}. Nhân viên đăng nhập bằng Google với email này.`,
    );
    setName("");
    setEmail("");
    setPassword("");
    setRole("employee");
    setLoginMethod("google");
    await load();
  }

  async function createDepartment(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const r = await fetch("/api/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: deptName }),
    });
    const json = await r.json();
    setSaving(false);
    if (!r.ok) {
      setError(json.error ?? "Không tạo được phòng ban.");
      return;
    }
    setDeptName("");
    setNotice(`Đã thêm phòng ban ${json.department.name}.`);
    await load();
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    setNotice("");
    const r = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    setSaving(false);
    if (!r.ok) {
      setError(json.error ?? "Không cập nhật được.");
      return;
    }
    if (json.tempPassword) {
      setNotice(`Mật khẩu mới của ${json.user.email}: ${json.tempPassword}`);
    }
    await load();
  }

  async function importRoster(commit: boolean) {
    if (!rosterFile) return;
    if (
      commit &&
      !window.confirm(
        `Tạo ${rosterReadyCount} tài khoản Google từ CSV? Các dòng lỗi hoặc email đã tồn tại sẽ được bỏ qua.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", rosterFile);
      formData.append("commit", String(commit));
      const response = await fetch("/api/admin/users/import", {
        method: "POST",
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Không nhập được CSV.");
      }

      setRosterRows(json.rows);
      setRosterReadyCount(json.readyCount);
      if (commit) {
        setNotice(`Đã tạo ${json.importedCount} tài khoản từ CSV.`);
        await load();
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Không nhập được CSV.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (error && !data) return <div className="p-8">{error}</div>;
  if (!data) return <div className="p-8">Đang tải...</div>;

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Phân quyền
        </p>
        <h2 className="text-3xl font-semibold mt-1">Quản trị tài khoản</h2>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Tạo tài khoản trước. Nhân viên có thể đăng nhập bằng Google nếu email
          tài khoản trùng email Google; chỉ tài khoản chọn mật khẩu mới cần gửi
          mật khẩu tạm.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {notice ? (
        <p className="text-sm rounded-xl border border-[var(--line)] bg-white px-4 py-3">
          {notice}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={createUser}
          className="bg-white border border-[var(--line)] rounded-2xl p-5 space-y-3"
        >
          <h3 className="font-medium">Thêm người dùng</h3>
          <input
            className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="Họ tên"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="Email đăng nhập (phải trùng email Google)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select
            className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            value={loginMethod}
            onChange={(e) => setLoginMethod(e.target.value as LoginMethod)}
          >
            <option value="google">Đăng nhập bằng Google</option>
            <option value="password">Đăng nhập bằng email và mật khẩu</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Không phòng ban</option>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          {loginMethod === "password" ? (
            <input
              className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              placeholder="Mật khẩu tạm (để trống sẽ tự tạo)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
            />
          ) : null}
          <button
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            Tạo tài khoản
          </button>
        </form>

        <form
          onSubmit={createDepartment}
          className="bg-white border border-[var(--line)] rounded-2xl p-5 space-y-3 h-fit"
        >
          <h3 className="font-medium">Thêm phòng ban</h3>
          <input
            className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="Tên phòng ban"
            value={deptName}
            onChange={(e) => setDeptName(e.target.value)}
            required
          />
          <button
            disabled={saving}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
          >
            Thêm phòng ban
          </button>
        </form>
      </section>

      <section className="bg-white border border-[var(--line)] rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="font-medium">Nhập danh sách người dùng từ CSV</h3>
          <p className="text-sm text-[var(--muted)] mt-1">
            Tài khoản được tạo để đăng nhập bằng Google. Cột bắt buộc: name,
            email. Cột role và department là tùy chọn; role mặc định là
            employee. Phòng ban cần khớp tên hoặc slug đã có.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={(event) => {
              setRosterFile(event.target.files?.[0] ?? null);
              setRosterRows([]);
              setRosterReadyCount(0);
            }}
          />
          <a
            className="text-sm underline"
            download="user-roster-template.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent("name,email,role,department\n")}`}
          >
            Tải mẫu CSV
          </a>
          <button
            type="button"
            disabled={saving || !rosterFile}
            onClick={() => importRoster(false)}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
          >
            Xem trước
          </button>
          {rosterReadyCount > 0 ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => importRoster(true)}
              className="rounded-lg bg-[var(--accent)] text-white px-4 py-2 text-sm disabled:opacity-60"
            >
              Nhập {rosterReadyCount} tài khoản
            </button>
          ) : null}
        </div>
        {rosterRows.length > 0 ? (
          <div className="max-h-80 overflow-auto rounded-lg border border-[var(--line)]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--bg-elev)]">
                <tr>
                  <th className="px-3 py-2">Dòng</th>
                  <th className="px-3 py-2">Tên</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Vai trò</th>
                  <th className="px-3 py-2">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {rosterRows.map((row) => (
                  <tr key={`${row.line}-${row.email}`} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2">{row.line}</td>
                    <td className="px-3 py-2">{row.name || "—"}</td>
                    <td className="px-3 py-2">{row.email || "—"}</td>
                    <td className="px-3 py-2">{ROLE_LABEL[row.role]}</td>
                    <td className="px-3 py-2">
                      {row.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="font-medium mb-3">Người dùng</h3>
        <div className="bg-white border border-[var(--line)] rounded-2xl overflow-x-auto">
          <div className="grid grid-cols-[1.2fr_1.4fr_0.9fr_1fr_0.7fr_auto] gap-2 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] border-b border-[var(--line)] min-w-[820px]">
            <span>Tên</span>
            <span>Email</span>
            <span>Vai trò</span>
            <span>Phòng ban</span>
            <span>Trạng thái</span>
            <span />
          </div>
          {data.users.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-[1.2fr_1.4fr_0.9fr_1fr_0.7fr_auto] gap-2 px-4 py-2 border-b border-[var(--line)] text-sm items-center min-w-[820px]"
            >
              <span>{user.name}</span>
              <span className="truncate">{user.email}</span>
              <select
                className="rounded-md border border-[var(--line)] px-2 py-1 text-sm"
                value={user.role}
                onChange={(e) =>
                  patchUser(user.id, { role: e.target.value as Role })
                }
              >
                {Object.entries(ROLE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-[var(--line)] px-2 py-1 text-sm"
                value={user.departmentId ?? ""}
                onChange={(e) =>
                  patchUser(user.id, { departmentId: e.target.value || null })
                }
              >
                <option value="">—</option>
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <span>{user.active ? "Hoạt động" : "Đã khóa"}</span>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="text-xs underline"
                  disabled={saving}
                  onClick={() => patchUser(user.id, { resetPassword: true })}
                >
                  Reset MK
                </button>
                <button
                  type="button"
                  className="text-xs underline"
                  disabled={saving}
                  onClick={() => patchUser(user.id, { active: !user.active })}
                >
                  {user.active ? "Khóa" : "Mở"}
                </button>
              </div>
            </div>
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

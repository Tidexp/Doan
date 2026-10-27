"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function errorMessage(code: string | null) {
  if (code === "AccessDenied") {
    return "Email này chưa được cấp tài khoản hoặc đã bị khóa. Liên hệ quản trị viên.";
  }
  if (code === "OAuthAccountNotLinked") {
    return "Email này đã gắn với tài khoản khác. Dùng email/mật khẩu do quản trị viên cấp.";
  }
  if (code === "CredentialsSignin") {
    return "Email hoặc mật khẩu không đúng.";
  }
  return code ? "Không đăng nhập được. Thử lại hoặc liên hệ quản trị viên." : "";
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(errorMessage(searchParams.get("error")));
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Email hoặc mật khẩu không đúng.");
      return;
    }
    router.push("/documents");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden lg:flex flex-col justify-between p-12 bg-[#18231c] text-[#e8efe6]">
        <p className="text-xs tracking-[0.28em] uppercase text-[#9bb59e]">
          Knowledge OS
        </p>
        <div>
          <h1 className="text-4xl font-semibold leading-tight max-w-md">
            Kho tri thức doanh nghiệp, hỏi đáp có trích dẫn.
          </h1>
          <p className="mt-4 max-w-md text-[#c5d4c6]">
            Tài khoản do quản trị viên cấp. Nhân viên đăng nhập bằng email nội bộ
            hoặc Google (nếu công ty bật).
          </p>
        </div>
        <p className="text-sm text-[#9bb59e]">Knowledge OS · Graph + Vector RAG</p>
      </section>
      <section className="flex items-center justify-center p-8">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md bg-[var(--bg-elev)] border border-[var(--line)] rounded-2xl p-8 shadow-sm"
        >
          <h2 className="text-2xl font-semibold">Đăng nhập</h2>
          <p className="text-sm text-[var(--muted)] mt-1 mb-6">
            Dùng email đã được quản trị viên cấp. Nếu tài khoản dùng Google,
            hãy đăng nhập bằng đúng email đó.
          </p>
          <label className="block text-sm mb-1">Email</label>
          <input
            className="w-full mb-4 rounded-lg border border-[var(--line)] bg-white px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            required
          />
          <label className="block text-sm mb-1">Mật khẩu</label>
          <input
            className="w-full mb-4 rounded-lg border border-[var(--line)] bg-white px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
          {error ? <p className="text-sm text-[var(--danger)] mb-3">{error}</p> : null}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-[var(--accent)] text-white py-2.5 font-medium disabled:opacity-60"
          >
            {loading ? "Đang vào..." : "Vào hệ thống"}
          </button>
          {googleEnabled ? (
            <button
              type="button"
              className="w-full mt-3 rounded-lg border border-[var(--line)] py-2.5"
              onClick={() => signIn("google", { callbackUrl: "/documents" })}
            >
              Đăng nhập Google
            </button>
          ) : null}
        </form>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BookOpen, MessageSquare, Settings2, LayoutDashboard, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/documents", label: "Tài liệu", icon: BookOpen },
  { href: "/chat", label: "Hỏi đáp", icon: MessageSquare },
  { href: "/admin", label: "Quản trị", icon: Settings2, admin: true },
];

export function AppShell({
  children,
  role,
  name,
}: {
  children: React.ReactNode;
  role: string;
  name: string;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr]">
      <aside className="bg-[#18231c] text-[#e8efe6] flex flex-col px-5 py-6">
        <div className="mb-10">
          <p className="text-[11px] tracking-[0.22em] uppercase text-[#9bb59e]">
            Enterprise
          </p>
          <h1 className="text-xl font-semibold mt-1">Knowledge OS</h1>
        </div>
        <nav className="flex flex-col gap-1">
          {links
            .filter((link) => !link.admin || role === "admin")
            .map((link) => {
              const Icon = link.icon;
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                    active
                      ? "bg-[#2b4634] text-white"
                      : "text-[#c5d4c6] hover:bg-[#223128]",
                  )}
                >
                  <Icon size={16} />
                  {link.label}
                </Link>
              );
            })}
        </nav>
        <div className="mt-auto pt-8 border-t border-white/10">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-[#9bb59e] capitalize mb-3">{role}</p>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 text-sm text-[#c5d4c6] hover:text-white"
          >
            <LogOut size={14} />
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="min-h-screen">{children}</main>
    </div>
  );
}

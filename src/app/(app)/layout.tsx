import { requireSession } from "@/lib/auth/guards";
import { AppShell } from "@/components/app-shell";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <AppShell
      role={session.user.role}
      name={session.user.name ?? session.user.email ?? "User"}
    >
      {children}
    </AppShell>
  );
}

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    redirect("/documents");
  }
  return session;
}

export async function requireAdminApi() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}

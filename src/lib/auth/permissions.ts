import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { sourcePermissions, sources } from "@/lib/db/schema";

export type AccessUser = {
  id: string;
  role: "admin" | "manager" | "employee" | "guest";
  departmentId: string | null;
};

export async function listAccessibleSourceIds(user: AccessUser) {
  if (user.role === "admin") {
    const rows = await db.select({ id: sources.id }).from(sources);
    return rows.map((r) => r.id);
  }

  const permRows = user.departmentId
    ? await db
        .select({ sourceId: sourcePermissions.sourceId })
        .from(sourcePermissions)
        .where(eq(sourcePermissions.departmentId, user.departmentId))
    : [];

  const clauses = [eq(sources.uploadedBy, user.id)];
  if (user.departmentId) {
    clauses.push(eq(sources.departmentId, user.departmentId));
  }
  if (permRows.length) {
    clauses.push(inArray(sources.id, permRows.map((p) => p.sourceId)));
  }

  const rows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(or(...clauses));

  return [...new Set(rows.map((r) => r.id))];
}

export async function canAccessSource(user: AccessUser, sourceId: string) {
  if (user.role === "admin") return true;

  const clauses = [eq(sources.uploadedBy, user.id)];
  if (user.departmentId) {
    clauses.push(eq(sources.departmentId, user.departmentId));
  }

  const [row] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceId), or(...clauses)))
    .limit(1);
  if (row) return true;

  if (!user.departmentId) return false;
  const [perm] = await db
    .select()
    .from(sourcePermissions)
    .where(
      and(
        eq(sourcePermissions.sourceId, sourceId),
        eq(sourcePermissions.departmentId, user.departmentId),
      ),
    )
    .limit(1);
  return Boolean(perm);
}

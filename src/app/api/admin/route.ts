import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  departments,
  duplicateFlags,
  processingLogs,
  sources,
  users,
} from "@/lib/db/schema";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [userRows, deptRows, logs, dups, sourceRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
        departmentId: users.departmentId,
        departmentName: departments.name,
      })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId)),
    db.select().from(departments),
    db
      .select()
      .from(processingLogs)
      .orderBy(desc(processingLogs.createdAt))
      .limit(50),
    db.select().from(duplicateFlags).limit(50),
    db
      .select({
        id: sources.id,
        title: sources.title,
        status: sources.status,
        chunkCount: sources.chunkCount,
        pageCount: sources.pageCount,
      })
      .from(sources),
  ]);

  return NextResponse.json({
    users: userRows,
    departments: deptRows,
    logs,
    duplicates: dups,
    sources: sourceRows,
  });
}

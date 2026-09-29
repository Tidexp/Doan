import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { canAccessSource } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { documentChunks, processingLogs, sources } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const allowed = await canAccessSource(session.user, id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const chunks = await db
    .select({
      id: documentChunks.id,
      content: documentChunks.content,
      metadata: documentChunks.metadata,
    })
    .from(documentChunks)
    .where(eq(documentChunks.sourceId, id));

  const logs = await db
    .select()
    .from(processingLogs)
    .where(eq(processingLogs.sourceId, id))
    .orderBy(desc(processingLogs.createdAt));

  return NextResponse.json({ source, chunks, logs });
}

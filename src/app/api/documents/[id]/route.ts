import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import fs from "node:fs/promises";
import { auth } from "@/auth";
import { canAccessSource, canModifySource } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { documentChunks, processingLogs, sources } from "@/lib/db/schema";
import { deleteGraphBySourceId } from "@/lib/graph/queries";
import { hasNeo4j } from "@/lib/env";

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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Check if user can modify this document (admin or uploader only)
  const allowed = await canModifySource(session.user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Forbidden: Only admins and document uploaders can delete documents" },
      { status: 403 }
    );
  }

  // Get source before deleting
  const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Delete from Neo4j graph database
    if (hasNeo4j()) {
      await deleteGraphBySourceId(id);
    }

    // Delete from database (cascades to chunks, logs via schema)
    await db.delete(sources).where(eq(sources.id, id));

    // Delete physical file
    try {
      await fs.unlink(source.fileUrl);
    } catch (fileError) {
      // File might already be deleted or not exist, continue anyway
      console.warn(`Could not delete file ${source.fileUrl}:`, fileError);
    }

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully"
    });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}

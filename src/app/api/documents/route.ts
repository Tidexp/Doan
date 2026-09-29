import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { listAccessibleSourceIds } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { departments, sourcePermissions, sources, users } from "@/lib/db/schema";
import { enqueueDocumentJob } from "@/lib/queue/queues";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ids = await listAccessibleSourceIds(session.user);
  if (ids.length === 0) return NextResponse.json({ sources: [] });

  const rows = await db
    .select({
      id: sources.id,
      title: sources.title,
      status: sources.status,
      mimeType: sources.mimeType,
      version: sources.version,
      pageCount: sources.pageCount,
      chunkCount: sources.chunkCount,
      errorMessage: sources.errorMessage,
      createdAt: sources.createdAt,
      departmentName: departments.name,
      uploaderName: users.name,
    })
    .from(sources)
    .leftJoin(departments, eq(departments.id, sources.departmentId))
    .leftJoin(users, eq(users.id, sources.uploadedBy))
    .where(inArray(sources.id, ids))
    .orderBy(desc(sources.createdAt));

  return NextResponse.json({ sources: rows });
}

export async function POST(request: Request) {
  const started = performance.now();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "guest") {
    return NextResponse.json(
      { error: "Tài khoản khách không được tải tài liệu." },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const departmentId = String(form.get("departmentId") ?? "");
  const extraDepartments = String(form.get("extraDepartmentIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  const name = file.name.toLowerCase();
  const okExt =
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    name.endsWith(".md") ||
    name.endsWith(".txt");
  if (!ALLOWED.has(mimeType) && !okExt) {
    return NextResponse.json(
      { error: "Chỉ hỗ trợ PDF, DOCX, Markdown." },
      { status: 400 },
    );
  }

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  await mkdir(uploadDir, { recursive: true });
  const storedName = `${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const filePath = path.join(uploadDir, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const [source] = await db
    .insert(sources)
    .values({
      title: file.name.replace(/\.[^.]+$/, ""),
      fileUrl: path.resolve(filePath),
      mimeType: okExt && name.endsWith(".md") ? "text/markdown" : mimeType,
      uploadedBy: session.user.id,
      departmentId: departmentId || session.user.departmentId,
      status: "queued",
    })
    .returning();

  const permDeptIds = [
    ...new Set(
      [source.departmentId, ...extraDepartments].filter(Boolean) as string[],
    ),
  ];
  if (permDeptIds.length) {
    await db.insert(sourcePermissions).values(
      permDeptIds.map((deptId) => ({
        sourceId: source.id,
        departmentId: deptId,
      })),
    );
  }

  await enqueueDocumentJob(source.id);

  return NextResponse.json(
    {
      id: source.id,
      status: source.status,
      elapsedMs: Math.round(performance.now() - started),
    },
    { status: 202 },
  );
}

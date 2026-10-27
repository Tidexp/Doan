import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { departments } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/auth/guards";

const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
});

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || `dept-${Date.now().toString(36)}`;
}

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  const parsed = createDepartmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  let slug = slugify(parsed.data.name);
  const [conflict] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.slug, slug))
    .limit(1);
  if (conflict) slug = `${slug}-${Date.now().toString(36)}`;

  const [created] = await db
    .insert(departments)
    .values({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
    })
    .returning();

  return NextResponse.json({ department: created }, { status: 201 });
}

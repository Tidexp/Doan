import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/auth/guards";
import {
  USER_ROLES,
  generateTempPassword,
  hashPassword,
} from "@/lib/auth/users";

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().toLowerCase(),
  role: z.enum(USER_ROLES),
  departmentId: z.string().uuid().nullable().optional(),
  loginMethod: z.enum(["google", "password"]).optional(),
  password: z.string().min(8).max(72).optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  const parsed = createUserSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dữ liệu không hợp lệ.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "Email này đã có tài khoản." },
      { status: 409 },
    );
  }

  const loginMethod = parsed.data.loginMethod ?? "password";
  const tempPassword =
    loginMethod === "password"
      ? (parsed.data.password ?? generateTempPassword())
      : undefined;
  const [created] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      departmentId: parsed.data.departmentId ?? null,
      passwordHash: tempPassword ? await hashPassword(tempPassword) : null,
      active: true,
    })
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      departmentId: users.departmentId,
      active: users.active,
    });

  return NextResponse.json(
    { user: created, ...(tempPassword ? { tempPassword } : {}) },
    { status: 201 },
  );
}

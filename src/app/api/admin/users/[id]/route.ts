import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdminApi } from "@/lib/auth/guards";
import {
  USER_ROLES,
  countActiveAdmins,
  generateTempPassword,
  hashPassword,
} from "@/lib/auth/users";

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
  password: z.string().min(8).max(72).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  const { id } = await context.params;
  const parsed = updateUserSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dữ liệu không hợp lệ.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
  }

  const nextRole = parsed.data.role ?? existing.role;
  const nextActive = parsed.data.active ?? existing.active;
  const losesAdminAccess =
    existing.role === "admin" &&
    existing.active &&
    (nextRole !== "admin" || nextActive === false);

  if (losesAdminAccess && (await countActiveAdmins(existing.id)) < 1) {
    return NextResponse.json(
      { error: "Phải còn ít nhất một quản trị viên đang hoạt động." },
      { status: 400 },
    );
  }

  if (parsed.data.active === false && existing.id === admin.user.id) {
    return NextResponse.json(
      { error: "Bạn không thể tự khóa tài khoản của mình." },
      { status: 400 },
    );
  }

  const tempPassword =
    parsed.data.resetPassword || parsed.data.password
      ? (parsed.data.password ?? generateTempPassword())
      : undefined;

  const [updated] = await db
    .update(users)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.departmentId !== undefined
        ? { departmentId: parsed.data.departmentId }
        : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      ...(tempPassword ? { passwordHash: await hashPassword(tempPassword) } : {}),
    })
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      departmentId: users.departmentId,
      active: users.active,
    });

  return NextResponse.json({
    user: updated,
    ...(tempPassword ? { tempPassword } : {}),
  });
}

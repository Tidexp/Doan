import "dotenv/config"; // Load .env file
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { departments, users } from "./schema";

async function upsertDepartment(name: string, slug: string, description: string) {
  const [existing] = await db
    .select()
    .from(departments)
    .where(eq(departments.slug, slug))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(departments)
    .values({ name, slug, description })
    .returning();
  return created;
}

async function upsertUser(input: {
  name: string;
  email: string;
  password?: string;
  role: "admin" | "manager" | "employee" | "guest";
  departmentId: string | null;
}) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: input.password
        ? await bcrypt.hash(input.password, 10)
        : null,
      role: input.role,
      departmentId: input.departmentId,
    })
    .returning();
  return created;
}

async function main() {
  const engineering = await upsertDepartment(
    "Công nghệ",
    "engineering",
    "Tài liệu kỹ thuật, kiến trúc hệ thống",
  );
  const hr = await upsertDepartment(
    "Nhân sự",
    "hr",
    "Quy chế nội bộ, chính sách nhân sự",
  );
  const legal = await upsertDepartment(
    "Pháp chế",
    "legal",
    "Hợp đồng, compliance",
  );
  await upsertDepartment(
    "Kinh doanh",
    "sales",
    "Tài liệu bán hàng và quy trình khách hàng",
  );

  await upsertUser({
    name: "Quản trị viên",
    email: "admin@local",
    password: "admin123",
    role: "admin",
    departmentId: engineering.id,
  });
  await upsertUser({
    name: "Nhân sự",
    email: "hr@local",
    password: "hr123456",
    role: "manager",
    departmentId: hr.id,
  });
  await upsertUser({
    name: "Kỹ sư",
    email: "dev@local",
    password: "dev123456",
    role: "employee",
    departmentId: engineering.id,
  });
  await upsertUser({
    name: "Pháp chế",
    email: "legal@local",
    password: "legal123",
    role: "employee",
    departmentId: legal.id,
  });
  await upsertUser({
    name: "Khách",
    email: "guest@local",
    role: "guest",
    departmentId: null,
  });

  console.log("Seeded departments and demo users.");
  console.log("  admin@local / admin123");
  console.log("  hr@local / hr123456");
  console.log("  dev@local / dev123456");
  console.log("  legal@local / legal123");
  console.log("  guest@local (guest mode, no password)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

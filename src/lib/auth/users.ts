import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const USER_ROLES = ["admin", "manager", "employee", "guest"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export function generateTempPassword() {
  return randomBytes(9).toString("base64url").slice(0, 12);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function countActiveAdmins(exceptUserId?: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(
      exceptUserId
        ? and(
            eq(users.role, "admin"),
            eq(users.active, true),
            ne(users.id, exceptUserId),
          )
        : and(eq(users.role, "admin"), eq(users.active, true)),
    );
  return Number(row?.count ?? 0);
}

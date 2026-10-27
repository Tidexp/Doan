import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { UserRole } from "@/lib/auth/users";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: UserRole;
      departmentId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    departmentId?: string | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!user?.active || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;

      const allowedDomain = process.env.AUTH_GOOGLE_ALLOWED_DOMAIN?.toLowerCase();
      if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
        return false;
      }

      const [existing] = await db
        .select({ id: users.id, active: users.active })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      return Boolean(existing?.active);
    },
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email)?.toString().toLowerCase();
      if (user && email) {
        const [existing] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existing?.active) {
          token.id = existing.id;
          token.role = existing.role;
          token.departmentId = existing.departmentId;
          token.name = existing.name;
          token.email = existing.email;
        }
        return token;
      }

      const userId = typeof token.id === "string" ? token.id : "";
      if (!userId) return token;

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!existing?.active) {
        delete token.id;
        return token;
      }
      token.role = existing.role;
      token.departmentId = existing.departmentId;
      token.name = existing.name;
      token.email = existing.email;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string" && token.id) {
        session.user.id = token.id;
        session.user.role = token.role as UserRole;
        session.user.departmentId =
          typeof token.departmentId === "string" || token.departmentId === null
            ? token.departmentId
            : null;
        if (token.name) session.user.name = String(token.name);
        if (token.email) session.user.email = String(token.email);
      }
      return session;
    },
  },
});

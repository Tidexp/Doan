import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "admin" | "manager" | "employee" | "guest";
      departmentId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "manager" | "employee" | "guest";
    departmentId: string | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
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
        if (!email) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!user) return null;

        if (user.role === "guest") {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          };
        }

        if (!user.passwordHash || !password) return null;
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
    async jwt({ token, user, account }) {
      if (user) {
        let existing = await db
          .select()
          .from(users)
          .where(eq(users.email, user.email ?? ""))
          .limit(1)
          .then((rows) => rows[0]);

        if (!existing && account?.provider === "google" && user.email) {
          const [created] = await db
            .insert(users)
            .values({
              name: user.name ?? "Người dùng Google",
              email: user.email.toLowerCase(),
              image: user.image,
              role: "employee",
            })
            .returning();
          existing = created;
        }

        if (existing) {
          token.id = existing.id;
          token.role = existing.role;
          token.departmentId = existing.departmentId;
          token.name = existing.name;
          token.email = existing.email;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.departmentId = token.departmentId;
      }
      return session;
    },
  },
});

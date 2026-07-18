import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const NEXT_AUTH: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.password) return null;
        if (!user.isVerified) throw new Error("Please verify your email first");

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? "",
          role: user.role ?? "user",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const { prisma } = await import("@/lib/prisma");

      // Client triggers this via useSession().update({ impersonateUserId: ... })
      if (trigger === "update" && session && "impersonateUserId" in session) {
        if (session.impersonateUserId) {
          // Only a real admin, not already impersonating someone else, can start
          if (token.role === "admin" && !token.impersonatingUserId) {
            token.impersonatingUserId = session.impersonateUserId as string;
          }
        } else {
          token.impersonatingUserId = null;
          token.impersonatedName = null;
          token.impersonatedEmail = null;
        }
      }

      if (token.impersonatingUserId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.impersonatingUserId as string },
          select: { id: true, email: true, name: true, role: true, isApproved: true, details: { select: { deltaUserId: true } } },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.isApproved = dbUser.isApproved;
          token.deltaUserId = dbUser.details?.deltaUserId ?? null;
          token.impersonatedName = dbUser.name ?? dbUser.email;
          token.impersonatedEmail = dbUser.email;
          return token;
        }
        // Target user vanished (deleted etc) — bail out of impersonation safely
        token.impersonatingUserId = null;
      }

      // Not impersonating — always fetch fresh data from DB by the real logged-in email
      const email = (user?.email ?? token.email) as string;
      if (email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, role: true, isApproved: true, details: { select: { deltaUserId: true } } },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.isApproved = dbUser.isApproved;
          token.deltaUserId = dbUser.details?.deltaUserId ?? null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.isApproved = token.isApproved as boolean;
        session.user.deltaUserId = token.deltaUserId as string | null;

        session.isImpersonating = !!token.impersonatingUserId;
        if (token.impersonatingUserId) {
          session.user.name = (token.impersonatedName as string) ?? session.user.name;
          session.user.email = (token.impersonatedEmail as string) ?? session.user.email;
          session.realAdmin = { name: session.user.name, email: token.email as string };
        } else {
          session.realAdmin = null;
          // Always refresh isApproved from DB to reflect admin changes immediately
          if (token.id) {
            try {
              const { prisma } = await import("@/lib/prisma");
              const dbUser = await prisma.user.findUnique({
                where: { id: token.id as string },
                select: { isApproved: true, role: true, details: { select: { deltaUserId: true } } },
              });
              if (dbUser) {
                session.user.isApproved = dbUser.isApproved;
                session.user.role = dbUser.role;
                session.user.deltaUserId = dbUser.details?.deltaUserId ?? null;
              }
            } catch {}
          }
        }
      }
      return session;
    },
  },
  pages: { signIn: "/Signup" },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

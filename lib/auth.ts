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
    async jwt({ token, user }) {
      // Always fetch fresh data from DB on every JWT call
      const email = (user?.email ?? token.email) as string;
      if (email) {
        const { prisma } = await import("@/lib/prisma");
        const dbUser = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, role: true, isApproved: true, details: { select: { deltaUserId: true } } },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.isApproved = dbUser.isApproved;
          token.deltaUserId = dbUser.details?.deltaUserId ?? null;
          console.log("JWT refresh:", email, "isApproved:", dbUser.isApproved, "deltaUserId:", dbUser.details?.deltaUserId);
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
      }
      return session;
    },
  },
  pages: { signIn: "/Signup" },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token as any;
    const role = token?.role as string | undefined;
    const isApproved = token?.isApproved as boolean | undefined;
    const deltaUserId = token?.deltaUserId as string | null | undefined;

    // Admin protection
    if (pathname.startsWith("/admin") && role !== "admin") {
      return NextResponse.redirect(new URL("/Signup", req.url));
    }

    // Users without Delta ID or not approved can only access marketplace
    if (pathname.startsWith("/user") && role !== "admin") {
      if (!deltaUserId) {
        return NextResponse.redirect(new URL("/marketplace?connect=1", req.url));
      }
      if (!isApproved) {
        return NextResponse.redirect(new URL("/marketplace?pending=1", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: { authorized: ({ token }) => !!token },
    pages: { signIn: "/Signup" },
  }
);

export const config = {
  matcher: ["/user/:path*", "/admin/:path*"],
};

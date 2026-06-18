import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/Signup", req.url));
  }
  const REDIRECT_URI = process.env.NEXTAUTH_URL + "/api/auth/delta/callback";
  const state = Math.random().toString(36).substring(2, 15);
  const url = new URL("https://www.delta.exchange/app/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.DELTA_CLIENT_ID!);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", "read");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}

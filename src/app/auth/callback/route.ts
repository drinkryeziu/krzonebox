import { NextResponse } from "next/server";
import { userClient } from "@/lib/supabase";

/** Completes the magic-link sign-in. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const sb = await userClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/inbox", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}

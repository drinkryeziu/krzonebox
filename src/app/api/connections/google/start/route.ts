import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { signState } from "@/lib/crypto";
import { googleAuthUrl } from "@/lib/providers/google";
import { env } from "@/lib/env";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.redirect(googleAuthUrl(signState({ uid: user.id })));
  } catch {
    return NextResponse.redirect(`${env.appUrl()}/login`);
  }
}

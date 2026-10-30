import { NextResponse } from "next/server";
import { adminClient, requireUser } from "@/lib/supabase";
import { encryptJson, verifyState } from "@/lib/crypto";
import { exchangeGoogleCode, fetchRecentGmail } from "@/lib/providers/google";
import { ingest } from "@/lib/ingest";
import { env } from "@/lib/env";

export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${env.appUrl()}/connections?${q}`);
  try {
    const user = await requireUser();
    const state = verifyState(url.searchParams.get("state") ?? "");
    if (!state || state.uid !== user.id) return back("error=" + encodeURIComponent("Sign-in link expired. Try again."));
    if (url.searchParams.get("error")) return back("error=" + encodeURIComponent("Google access was not granted."));

    const creds = await exchangeGoogleCode(url.searchParams.get("code") ?? "");
    const sb = adminClient();
    // Reconnecting the same Google account replaces its tokens instead of duplicating it.
    const { data: existing } = await sb
      .from("connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .eq("external_id", creds.email)
      .maybeSingle();
    const row = { user_id: user.id, provider: "google", label: creds.email, external_id: creds.email, credentials_enc: encryptJson(creds), status: "active", status_detail: null };
    const { data: conn, error } = existing
      ? await sb.from("connections").update(row).eq("id", existing.id).select("id, user_id, provider").single()
      : await sb.from("connections").insert(row).select("id, user_id, provider").single();
    if (error || !conn) throw error;

    const items = await fetchRecentGmail(creds.access_token, creds.email);
    await ingest(conn as any, items);
    await sb.from("connections").update({ last_synced_at: new Date().toISOString() }).eq("id", conn.id);
    return back("connected=google");
  } catch (e) {
    console.error(e);
    return back("error=" + encodeURIComponent((e as Error).message || "Google connection failed."));
  }
}

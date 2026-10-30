import { NextResponse } from "next/server";
import { adminClient, HttpError, requireUser } from "@/lib/supabase";
import { route } from "@/lib/http";
import { loadConnection } from "@/lib/connections";
import { fetchRecentGmail, googleToken } from "@/lib/providers/google";
import { ingest } from "@/lib/ingest";

export const maxDuration = 300;

/** Pulls recent Gmail into the inbox. Chat apps push via webhooks and need no sync. */
export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const conn = await loadConnection(id, user.id);
  if (conn.provider !== "google") throw new HttpError(400, "Only email connections sync on demand.");
  const { token, creds } = await googleToken(conn.id, conn.credentials_enc);
  const items = await fetchRecentGmail(token, creds.email);
  await ingest(conn, items);
  await adminClient().from("connections").update({ last_synced_at: new Date().toISOString() }).eq("id", conn.id);
  return NextResponse.json({ ok: true, count: items.length });
});

import { NextResponse } from "next/server";
import { adminClient, requireUser } from "@/lib/supabase";
import { route } from "@/lib/http";
import { creds, loadConnection } from "@/lib/connections";
import { removeViberWebhook } from "@/lib/providers/viber";
import type { ViberCreds } from "@/lib/types";

/** Disconnects an account and deletes everything synced from it. */
export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const conn = await loadConnection(id, user.id);
  if (conn.provider === "viber") await removeViberWebhook(creds<ViberCreds>(conn));
  if (conn.provider === "google") {
    const c = creds<{ refresh_token: string }>(conn);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(c.refresh_token)}`, { method: "POST" }).catch(
      () => undefined,
    );
  }
  await adminClient().from("connections").delete().eq("id", conn.id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
});

import { after, NextResponse } from "next/server";
import { hmacMatches } from "@/lib/crypto";
import { creds, loadConnection } from "@/lib/connections";
import { parseViber } from "@/lib/providers/viber";
import { ingest } from "@/lib/ingest";
import type { ViberCreds } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const raw = await req.text();
  let conn;
  try {
    conn = await loadConnection(id);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const c = creds<ViberCreds>(conn);
  // Viber signs the body with the bot's auth token (also sent on the set_webhook test call).
  const sig = req.headers.get("x-viber-content-signature") ?? "";
  if (!hmacMatches(c.auth_token, raw, sig)) return new Response("Bad signature", { status: 401 });

  const items = parseViber(JSON.parse(raw));
  if (items.length) after(() => ingest(conn, items).catch((e) => console.error("viber ingest", e)));
  return NextResponse.json({ status: 0 });
}

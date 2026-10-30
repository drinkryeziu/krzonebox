import { after, NextResponse } from "next/server";
import { hmacMatches } from "@/lib/crypto";
import { creds, loadConnection } from "@/lib/connections";
import { parseWhatsApp } from "@/lib/providers/meta";
import { ingest } from "@/lib/ingest";
import type { WhatsAppCreds } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

/** Meta's one-time webhook verification handshake. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const u = new URL(req.url);
  try {
    const conn = await loadConnection(id);
    if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === conn.verify_token) {
      return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
  } catch {}
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const raw = await req.text();
  let conn;
  try {
    conn = await loadConnection(id);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const c = creds<WhatsAppCreds>(conn);
  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  if (!hmacMatches(c.app_secret, raw, sig)) return new Response("Bad signature", { status: 401 });

  const items = parseWhatsApp(JSON.parse(raw), c.phone_number_id);
  // Acknowledge immediately; Meta retries slow responses. Store + analyze afterwards.
  after(() => ingest(conn, items).catch((e) => console.error("whatsapp ingest", e)));
  return NextResponse.json({ ok: true });
}

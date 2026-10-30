import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, HttpError, requireUser } from "@/lib/supabase";
import { route } from "@/lib/http";
import { loadConversation } from "@/lib/conversation";
import { creds, loadConnection } from "@/lib/connections";
import { sendMessenger, sendWhatsApp } from "@/lib/providers/meta";
import { sendViber } from "@/lib/providers/viber";
import { googleToken, sendGmailReply } from "@/lib/providers/google";
import type { MessengerCreds, ViberCreds, WhatsAppCreds } from "@/lib/types";

const Body = z.object({ text: z.string().trim().min(1, "Write a reply first.").max(4000) });

/** Sends the user's (reviewed) reply through the channel the conversation came from. */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) throw new HttpError(400, b.error.issues[0]?.message ?? "Invalid reply.");
  const text = b.data.text;

  const convo = await loadConversation(id, user.id);
  const conn = await loadConnection(convo.connection_id, user.id);
  if (!convo.reply_to) throw new HttpError(400, "This conversation has no reply address.");

  let externalId: string;
  try {
    switch (conn.provider) {
      case "whatsapp":
        externalId = await sendWhatsApp(creds<WhatsAppCreds>(conn), convo.reply_to, text);
        break;
      case "messenger":
        externalId = await sendMessenger(creds<MessengerCreds>(conn), convo.reply_to, text);
        break;
      case "viber":
        externalId = await sendViber(creds<ViberCreds>(conn), convo.reply_to, text);
        break;
      case "google": {
        const { token, creds: g } = await googleToken(conn.id, conn.credentials_enc);
        const sb = adminClient();
        const { data: firstIn } = await sb
          .from("messages")
          .select("body")
          .eq("conversation_id", id)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const subject = firstIn?.body?.match(/^Subject: (.*)$/m)?.[1] ?? "";
        externalId = await sendGmailReply(token, g.email, convo.external_id, convo.reply_to, subject, text);
        break;
      }
    }
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }

  const now = new Date().toISOString();
  const sb = adminClient();
  await sb.from("messages").insert({
    user_id: user.id,
    conversation_id: id,
    external_id: externalId,
    direction: "out",
    sender: "You",
    body: text,
    sent_at: now,
  });
  await sb.from("conversations").update({ replied_at: now, unread: false, last_message_at: now }).eq("id", id);
  await sb.from("insights").update({ needs_reply: false, verdict: "You replied." }).eq("conversation_id", id);
  return NextResponse.json({ ok: true, sent_at: now });
});

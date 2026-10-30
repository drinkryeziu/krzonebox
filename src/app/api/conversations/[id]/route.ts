import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, HttpError, requireUser, userClient } from "@/lib/supabase";
import { route } from "@/lib/http";
import { loadConversation } from "@/lib/conversation";
import { channelOf, type Provider } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const convo = await loadConversation(id, user.id);
  const sb = await userClient();
  const [{ data: messages }, { data: insight }, { data: cal }] = await Promise.all([
    sb.from("messages").select("id, direction, sender, body, sent_at").eq("conversation_id", id).order("sent_at").limit(100),
    sb.from("insights").select("*").eq("conversation_id", id).maybeSingle(),
    sb.from("calendar_adds").select("html_link, title, starts_at").eq("conversation_id", id).maybeSingle(),
  ]);
  await adminClient().from("conversations").update({ unread: false }).eq("id", id);
  return NextResponse.json({
    conversation: {
      id: convo.id,
      channel: channelOf(convo.provider as Provider),
      from: convo.title,
      participant: convo.participant,
      replied_at: convo.replied_at,
    },
    messages: messages ?? [],
    insight: insight ?? null,
    calendar: cal ?? null,
  });
});

const Patch = z.object({ archived: z.boolean().optional(), unread: z.boolean().optional() });

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await loadConversation(id, user.id);
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Invalid update.");
  await adminClient().from("conversations").update(p.data).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
});

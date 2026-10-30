import { NextResponse } from "next/server";
import { requireUser, userClient } from "@/lib/supabase";
import { route } from "@/lib/http";
import { dailyBrief } from "@/lib/ai";
import { channelOf, type Provider } from "@/lib/types";

/** The inbox list: conversations joined with their AI triage, most urgent first. */
export const GET = route(async (req: Request) => {
  await requireUser();
  const sb = await userClient();
  const withBrief = new URL(req.url).searchParams.get("brief") === "1";

  const { data, error } = await sb
    .from("conversations")
    .select("id, provider, title, participant, last_message_at, unread, archived, replied_at, insights(summary, needs_reply, priority, event)")
    .eq("archived", false)
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const { data: adds } = await sb.from("calendar_adds").select("conversation_id");
  const added = new Set((adds ?? []).map((a) => a.conversation_id));

  const items = (data ?? []).map((c: any) => {
    const ins = Array.isArray(c.insights) ? c.insights[0] : c.insights;
    return {
      id: c.id,
      channel: channelOf(c.provider as Provider),
      from: c.title,
      participant: c.participant,
      last_message_at: c.last_message_at,
      unread: c.unread,
      summary: ins?.summary ?? "Analyzing…",
      needs_reply: !!ins?.needs_reply && !c.replied_at,
      priority: ins?.priority ?? 3,
      event: ins?.event ?? null,
      calendar_added: added.has(c.id),
    };
  });
  items.sort((a, b) =>
    Number(b.needs_reply) - Number(a.needs_reply) || a.priority - b.priority || b.last_message_at.localeCompare(a.last_message_at),
  );

  let brief: string | null = null;
  if (withBrief) {
    const since = Date.now() - 2 * 86_400_000;
    brief = await dailyBrief(
      items
        .filter((i) => i.needs_reply || Date.parse(i.last_message_at) > since)
        .map((i) => ({ from: i.from, channel: i.channel, summary: i.summary, needs_reply: i.needs_reply, priority: i.priority })),
    ).catch(() => null);
  }
  return NextResponse.json({ items, brief });
});

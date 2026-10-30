import "server-only";
import { adminClient } from "./supabase";
import { analyzeConversation } from "./ai";
import type { Inbound, Provider } from "./types";

interface Conn {
  id: string;
  user_id: string;
  provider: Provider;
}

/**
 * Stores normalized messages for one connection and re-runs the AI on each
 * conversation that changed. Duplicate deliveries (providers retry webhooks) are ignored.
 */
export async function ingest(conn: Conn, items: Inbound[]): Promise<void> {
  if (items.length === 0) return;
  const sb = adminClient();
  const touched = new Set<string>();

  for (const m of items) {
    const { data: convo, error } = await sb
      .from("conversations")
      .upsert(
        {
          user_id: conn.user_id,
          connection_id: conn.id,
          provider: conn.provider,
          external_id: m.conversationExternalId,
          title: m.title,
          participant: m.participant,
          reply_to: m.replyTo,
        },
        { onConflict: "connection_id,external_id" },
      )
      .select("id, last_message_at")
      .single();
    if (error || !convo) throw error ?? new Error("conversation upsert failed");

    const { error: msgErr, data: inserted } = await sb
      .from("messages")
      .upsert(
        {
          user_id: conn.user_id,
          conversation_id: convo.id,
          external_id: m.messageExternalId,
          direction: m.direction ?? "in",
          sender: m.sender,
          body: m.body.slice(0, 20_000),
          sent_at: m.sentAt.toISOString(),
        },
        { onConflict: "conversation_id,external_id", ignoreDuplicates: true },
      )
      .select("id");
    if (msgErr) throw msgErr;
    if (!inserted || inserted.length === 0) continue; // already had it

    const patch: Record<string, unknown> = {};
    if (new Date(convo.last_message_at) < m.sentAt) patch.last_message_at = m.sentAt.toISOString();
    if ((m.direction ?? "in") === "in") {
      patch.unread = true;
      patch.archived = false;
    }
    if (Object.keys(patch).length) await sb.from("conversations").update(patch).eq("id", convo.id);
    touched.add(convo.id);
  }

  // Analysis failures must not make the provider retry the webhook, so they are logged, not thrown.
  await Promise.all(
    [...touched].map((id) =>
      analyzeConversation(id).catch((e) => console.error("AI analysis failed", id, e)),
    ),
  );
}

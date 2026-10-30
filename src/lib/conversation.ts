import "server-only";
import { adminClient, HttpError } from "./supabase";

export interface ConversationRow {
  id: string;
  user_id: string;
  connection_id: string;
  provider: string;
  external_id: string;
  title: string;
  participant: string | null;
  reply_to: string | null;
  replied_at: string | null;
}

export async function loadConversation(id: string, userId: string): Promise<ConversationRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Conversation not found.");
  const { data } = await adminClient()
    .from("conversations")
    .select("id, user_id, connection_id, provider, external_id, title, participant, reply_to, replied_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Conversation not found.");
  return data as ConversationRow;
}

import "server-only";
import { adminClient, HttpError } from "./supabase";
import { decryptJson } from "./crypto";
import { env } from "./env";
import type { Provider } from "./types";

export interface ConnectionRow {
  id: string;
  user_id: string;
  provider: Provider;
  label: string;
  external_id: string | null;
  credentials_enc: string;
  verify_token: string;
  status: string;
}

export const webhookUrl = (provider: Provider, id: string) => `${env.appUrl()}/api/webhooks/${provider}/${id}`;

/** Loads a connection by id with the service role. Pass userId to enforce ownership. */
export async function loadConnection(id: string, userId?: string): Promise<ConnectionRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Connection not found.");
  let q = adminClient().from("connections").select("*").eq("id", id);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q.maybeSingle();
  if (!data) throw new HttpError(404, "Connection not found.");
  return data as ConnectionRow;
}

export const creds = <T>(c: ConnectionRow) => decryptJson<T>(c.credentials_enc);

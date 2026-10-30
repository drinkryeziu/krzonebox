import "server-only";
import type { Inbound, ViberCreds } from "../types";

const API = "https://chatapi.viber.com/pa";

async function call(path: string, c: ViberCreds, body: unknown) {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "X-Viber-Auth-Token": c.auth_token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  // Viber returns HTTP 200 with status != 0 on failure.
  if (!res.ok || json.status !== 0) throw new Error(json.status_message ?? `Viber API error ${res.status}`);
  return json;
}

export async function verifyViber(c: ViberCreds): Promise<{ id: string; name: string }> {
  const info = await call("get_account_info", c, {});
  return { id: info.id, name: info.name };
}

export async function setViberWebhook(c: ViberCreds, url: string): Promise<void> {
  await call("set_webhook", c, {
    url,
    event_types: ["message", "conversation_started", "subscribed", "unsubscribed"],
    send_name: true,
  });
}

export async function removeViberWebhook(c: ViberCreds): Promise<void> {
  await call("set_webhook", c, { url: "" }).catch(() => undefined);
}

export function parseViber(payload: any): Inbound[] {
  if (payload?.event !== "message" || !payload.sender?.id) return [];
  const m = payload.message ?? {};
  const name: string = payload.sender.name || "Viber user";
  const body =
    m.type === "text" ? m.text ?? "" : m.type === "location" ? "[location]" : `[${m.type ?? "message"}] ${m.text ?? ""}`.trim();
  return [
    {
      conversationExternalId: payload.sender.id,
      title: name,
      participant: name,
      replyTo: payload.sender.id,
      messageExternalId: String(payload.message_token),
      sender: name,
      body,
      sentAt: new Date(Number(payload.timestamp)),
    },
  ];
}

export async function sendViber(c: ViberCreds, receiver: string, text: string): Promise<string> {
  const r = await call("send_message", c, {
    receiver,
    type: "text",
    sender: { name: c.bot_name.slice(0, 28) },
    text,
  });
  return String(r.message_token ?? `out-${Date.now()}`);
}

import "server-only";
import type { Inbound, MessengerCreds, WhatsAppCreds } from "../types";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

async function graph(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? `Meta API error ${res.status}`;
    const code = json?.error?.code;
    // 131047 (WhatsApp) / 10 + subcode 2018278 (Messenger): outside the 24-hour customer service window.
    if (code === 131047 || json?.error?.error_subcode === 2018278) {
      throw new Error(
        "This contact last wrote more than 24 hours ago. Meta only allows free-form replies inside 24 hours; reply in the app or use an approved template.",
      );
    }
    throw new Error(msg);
  }
  return json;
}

// ---------- WhatsApp Business (Cloud API) ----------

export async function verifyWhatsApp(c: WhatsAppCreds): Promise<string> {
  const info = await graph(`/${c.phone_number_id}?fields=display_phone_number,verified_name`, c.access_token);
  return `${info.verified_name ?? "WhatsApp"} (${info.display_phone_number ?? c.phone_number_id})`;
}

export function parseWhatsApp(payload: any, phoneNumberId: string): Inbound[] {
  const out: Inbound[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (v?.metadata?.phone_number_id !== phoneNumberId) continue;
      const names = new Map<string, string>(
        (v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name ?? c.wa_id]),
      );
      for (const m of v.messages ?? []) {
        const name = names.get(m.from) ?? `+${m.from}`;
        out.push({
          conversationExternalId: m.from,
          title: name,
          participant: `+${m.from}`,
          replyTo: m.from,
          messageExternalId: m.id,
          sender: name,
          body: describeWhatsApp(m),
          sentAt: new Date(Number(m.timestamp) * 1000),
        });
      }
    }
  }
  return out;
}

function describeWhatsApp(m: any): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "image":
    case "video":
    case "document":
      return `[${m.type}] ${m[m.type]?.caption ?? m[m.type]?.filename ?? ""}`.trim();
    case "audio":
      return "[voice message]";
    case "location":
      return `[location] ${m.location?.name ?? ""} ${m.location?.latitude},${m.location?.longitude}`.trim();
    case "button":
      return m.button?.text ?? "[button]";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[interactive]";
    default:
      return `[${m.type}]`;
  }
}

export async function sendWhatsApp(c: WhatsAppCreds, to: string, text: string): Promise<string> {
  const r = await graph(`/${c.phone_number_id}/messages`, c.access_token, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  return r.messages?.[0]?.id ?? `out-${Date.now()}`;
}

// ---------- Messenger (Facebook Page inbox) ----------

export async function verifyMessenger(c: MessengerCreds): Promise<string> {
  const info = await graph(`/${c.page_id}?fields=name`, c.page_access_token);
  return info.name ?? `Page ${c.page_id}`;
}

/** Subscribes the Page to this app's webhook so messages are delivered. */
export async function subscribeMessenger(c: MessengerCreds): Promise<void> {
  await graph(`/${c.page_id}/subscribed_apps?subscribed_fields=messages`, c.page_access_token, {
    method: "POST",
  });
}

export async function parseMessenger(payload: any, c: MessengerCreds): Promise<Inbound[]> {
  if (payload?.object !== "page") return [];
  const out: Inbound[] = [];
  for (const entry of payload.entry ?? []) {
    if (entry.id !== c.page_id) continue;
    for (const ev of entry.messaging ?? []) {
      const msg = ev.message;
      if (!msg || !msg.mid) continue;
      const echo = !!msg.is_echo;
      const psid = echo ? ev.recipient?.id : ev.sender?.id;
      if (!psid) continue;
      const name = await messengerName(c, psid);
      const body =
        msg.text ?? (msg.attachments?.length ? `[${msg.attachments.map((a: any) => a.type).join(", ")}]` : "");
      out.push({
        conversationExternalId: psid,
        title: name,
        participant: name,
        replyTo: psid,
        messageExternalId: msg.mid,
        sender: echo ? "You" : name,
        body,
        sentAt: new Date(Number(ev.timestamp)),
        direction: echo ? "out" : "in",
      });
    }
  }
  return out;
}

async function messengerName(c: MessengerCreds, psid: string): Promise<string> {
  try {
    const p = await graph(`/${psid}?fields=first_name,last_name`, c.page_access_token);
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Messenger user";
  } catch {
    return "Messenger user";
  }
}

export async function sendMessenger(c: MessengerCreds, psid: string, text: string): Promise<string> {
  const r = await graph(`/me/messages`, c.page_access_token, {
    method: "POST",
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message: { text } }),
  });
  return r.message_id ?? `out-${Date.now()}`;
}

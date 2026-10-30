import "server-only";
import { adminClient } from "../supabase";
import { decryptJson, encryptJson } from "../crypto";
import { env } from "../env";
import type { GoogleCreds, Inbound, SuggestedEvent } from "../types";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

export const googleRedirectUri = () => `${env.appUrl()}/api/connections/google/callback`;

export function googleAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: env.googleClientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleCreds> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error_description ?? "Google sign-in failed");
  if (!t.refresh_token) throw new Error("Google did not return a refresh token. Remove KRZ OneBox from your Google account's third-party access and connect again.");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  }).then((r) => r.json());
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + (t.expires_in - 60) * 1000,
    email: info.email,
  };
}

/** Returns a valid access token, refreshing and re-saving it when expired. */
export async function googleToken(connectionId: string, credsEnc: string): Promise<{ token: string; creds: GoogleCreds }> {
  const creds = decryptJson<GoogleCreds>(credsEnc);
  if (creds.expires_at > Date.now()) return { token: creds.access_token, creds };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const t = await res.json();
  const sb = adminClient();
  if (!res.ok) {
    await sb.from("connections").update({ status: "error", status_detail: "Google access expired. Reconnect." }).eq("id", connectionId);
    throw new Error("Google access expired. Reconnect your Google account.");
  }
  const next = { ...creds, access_token: t.access_token, expires_at: Date.now() + (t.expires_in - 60) * 1000 };
  await sb.from("connections").update({ credentials_enc: encryptJson(next), status: "active", status_detail: null }).eq("id", connectionId);
  return { token: next.access_token, creds: next };
}

async function gapi(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Google API error ${res.status}`);
  return json;
}

// ---------- Gmail ----------

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Pulls recent inbox mail (skipping promotions/social) as normalized messages. */
export async function fetchRecentGmail(token: string, ownEmail: string, max = 30): Promise<Inbound[]> {
  const q = encodeURIComponent("in:inbox newer_than:14d -category:promotions -category:social");
  const list = await gapi(token, `${GMAIL}/messages?maxResults=${max}&q=${q}`);
  const ids: string[] = (list.messages ?? []).map((m: any) => m.id);
  const out: Inbound[] = [];
  for (const id of ids) {
    const m = await gapi(token, `${GMAIL}/messages/${id}?format=full`);
    const h = (name: string) =>
      m.payload?.headers?.find((x: any) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
    const from = h("From");
    const fromEmail = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
    const fromName = from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || fromEmail;
    const mine = fromEmail.toLowerCase() === ownEmail.toLowerCase();
    out.push({
      conversationExternalId: m.threadId,
      title: mine ? h("To") || "(you)" : fromName,
      participant: mine ? h("To") : fromEmail,
      replyTo: mine ? h("To") : h("Reply-To") || fromEmail,
      messageExternalId: m.id,
      sender: mine ? "You" : fromName,
      body: `Subject: ${h("Subject")}\n\n${stripQuoted(extractText(m.payload) || m.snippet || "")}`,
      sentAt: new Date(Number(m.internalDate)),
      direction: mine ? "out" : "in",
    });
  }
  return out;
}

function extractText(part: any): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);
  for (const p of part.parts ?? []) {
    const t = extractText(p);
    if (t) return t;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decode(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}
const decode = (b64: string) => Buffer.from(b64, "base64url").toString("utf8");

function stripQuoted(text: string): string {
  const cut = text.search(/\n(On .+wrote:|-----Original Message-----|>)/);
  return (cut > 0 ? text.slice(0, cut) : text).trim().slice(0, 8000);
}

export async function sendGmailReply(
  token: string,
  from: string,
  threadId: string,
  to: string,
  subject: string,
  text: string,
): Promise<string> {
  const thread = await gapi(token, `${GMAIL}/threads/${threadId}?format=metadata&metadataHeaders=Message-ID`);
  const last = thread.messages?.[thread.messages.length - 1];
  const msgId = last?.payload?.headers?.find((x: any) => x.name.toLowerCase() === "message-id")?.value;
  const subj = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subj).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    ...(msgId ? [`In-Reply-To: ${msgId}`, `References: ${msgId}`] : []),
  ];
  const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${text}`).toString("base64url");
  const sent = await gapi(token, `${GMAIL}/messages/send`, {
    method: "POST",
    body: JSON.stringify({ raw, threadId }),
  });
  return sent.id;
}

// ---------- Calendar ----------

export async function createCalendarEvent(
  token: string,
  ev: SuggestedEvent,
  timeZone: string,
  description: string,
): Promise<{ id: string; htmlLink: string }> {
  const start = new Date(ev.start);
  const body: Record<string, unknown> = { summary: ev.title, description, location: ev.location };
  if (ev.all_day) {
    const day = ev.start.slice(0, 10);
    const next = new Date(`${day}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    body.start = { date: day };
    body.end = { date: next.toISOString().slice(0, 10) };
  } else {
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60_000);
    body.start = { dateTime: start.toISOString(), timeZone };
    body.end = { dateTime: end.toISOString(), timeZone };
  }
  const r = await gapi(token, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: r.id, htmlLink: r.htmlLink };
}

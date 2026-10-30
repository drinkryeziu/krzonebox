export type Provider = "google" | "whatsapp" | "messenger" | "viber";
export type Channel = "whatsapp" | "messenger" | "viber" | "email";

export const channelOf = (p: Provider): Channel => (p === "google" ? "email" : p);

export interface GoogleCreds {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms epoch
  email: string;
}
export interface WhatsAppCreds {
  phone_number_id: string;
  access_token: string; // System user token with whatsapp_business_messaging
  app_secret: string; // Verifies X-Hub-Signature-256
}
export interface MessengerCreds {
  page_id: string;
  page_access_token: string;
  app_secret: string;
}
export interface ViberCreds {
  auth_token: string; // Bot token from partners.viber.com
  bot_name: string;
}

export interface SuggestedEvent {
  title: string;
  start: string; // ISO 8601 with offset
  end?: string;
  all_day?: boolean;
  location?: string;
}

export interface Insight {
  summary: string;
  detail: string;
  needs_reply: boolean;
  verdict: string;
  priority: 1 | 2 | 3;
  replies: { friendly: string; short: string; formal: string } | null;
  event: SuggestedEvent | null;
}

/** A normalized inbound message, whatever channel it came from. */
export interface Inbound {
  conversationExternalId: string;
  title: string;
  participant: string;
  replyTo: string;
  messageExternalId: string;
  sender: string;
  body: string;
  sentAt: Date;
  direction?: "in" | "out";
}

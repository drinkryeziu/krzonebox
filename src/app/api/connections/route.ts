import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, HttpError, requireUser } from "@/lib/supabase";
import { encryptJson } from "@/lib/crypto";
import { route } from "@/lib/http";
import { webhookUrl } from "@/lib/connections";
import { subscribeMessenger, verifyMessenger, verifyWhatsApp } from "@/lib/providers/meta";
import { setViberWebhook, verifyViber } from "@/lib/providers/viber";

export const GET = route(async () => {
  const user = await requireUser();
  const { data, error } = await adminClient()
    .from("connections")
    .select("id, provider, label, external_id, status, status_detail, last_synced_at, created_at, verify_token")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw error;
  return NextResponse.json({
    connections: (data ?? []).map((c) => ({
      ...c,
      webhook_url: c.provider === "google" ? null : webhookUrl(c.provider, c.id),
      // Only Meta asks for a verify token; it is shown to the owner so they can paste it into Meta's dashboard.
      verify_token: c.provider === "whatsapp" || c.provider === "messenger" ? c.verify_token : null,
    })),
  });
});

const Body = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("whatsapp"),
    phone_number_id: z.string().regex(/^\d+$/, "Phone number ID is numeric"),
    access_token: z.string().min(20),
    app_secret: z.string().min(16),
  }),
  z.object({
    provider: z.literal("messenger"),
    page_id: z.string().regex(/^\d+$/, "Page ID is numeric"),
    page_access_token: z.string().min(20),
    app_secret: z.string().min(16),
  }),
  z.object({
    provider: z.literal("viber"),
    auth_token: z.string().min(20),
  }),
]);

/** Creates a WhatsApp, Messenger or Viber connection from the user's own credentials. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid details.");
  const b = parsed.data;
  const sb = adminClient();

  let label: string;
  let externalId: string;
  let creds: Record<string, string>;
  try {
    if (b.provider === "whatsapp") {
      creds = { phone_number_id: b.phone_number_id, access_token: b.access_token, app_secret: b.app_secret };
      label = await verifyWhatsApp(creds as any);
      externalId = b.phone_number_id;
    } else if (b.provider === "messenger") {
      creds = { page_id: b.page_id, page_access_token: b.page_access_token, app_secret: b.app_secret };
      label = await verifyMessenger(creds as any);
      externalId = b.page_id;
    } else {
      const info = await verifyViber({ auth_token: b.auth_token, bot_name: "" });
      creds = { auth_token: b.auth_token, bot_name: info.name };
      label = info.name;
      externalId = info.id;
    }
  } catch (e) {
    throw new HttpError(400, `Couldn't verify those details: ${(e as Error).message}`);
  }

  const { data: conn, error } = await sb
    .from("connections")
    .insert({ user_id: user.id, provider: b.provider, label, external_id: externalId, credentials_enc: encryptJson(creds) })
    .select("id, provider, label, verify_token")
    .single();
  if (error || !conn) throw error ?? new Error("Could not save connection.");

  const hook = webhookUrl(b.provider, conn.id);
  // Viber and Messenger can be wired up from here; WhatsApp's webhook is set in the Meta dashboard.
  try {
    if (b.provider === "viber") await setViberWebhook(creds as any, hook);
    if (b.provider === "messenger") await subscribeMessenger(creds as any);
  } catch (e) {
    await sb
      .from("connections")
      .update({ status: "error", status_detail: `Webhook setup: ${(e as Error).message}` })
      .eq("id", conn.id);
  }

  return NextResponse.json({
    connection: {
      id: conn.id,
      provider: conn.provider,
      label: conn.label,
      webhook_url: hook,
      verify_token: b.provider === "viber" ? null : conn.verify_token,
    },
  });
});

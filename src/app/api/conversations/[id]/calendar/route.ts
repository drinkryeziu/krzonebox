import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, HttpError, requireUser } from "@/lib/supabase";
import { route } from "@/lib/http";
import { loadConversation } from "@/lib/conversation";
import { createCalendarEvent, googleToken } from "@/lib/providers/google";
import type { SuggestedEvent } from "@/lib/types";

const Body = z.object({
  title: z.string().min(1).max(200),
  start: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid start time"),
  end: z.string().optional(),
  all_day: z.boolean().optional(),
  location: z.string().max(300).optional(),
  time_zone: z.string().max(64).default("UTC"),
});

/** Adds the (user-confirmed) event to the primary Google Calendar of the user's first Google connection. */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const convo = await loadConversation(id, user.id);
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) throw new HttpError(400, b.error.issues[0]?.message ?? "Invalid event.");

  const sb = adminClient();
  const { data: google } = await sb
    .from("connections")
    .select("id, credentials_enc")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!google) throw new HttpError(400, "Connect your Google account to add events to your calendar.");

  const { token } = await googleToken(google.id, google.credentials_enc);
  const { time_zone, ...ev } = b.data;
  const created = await createCalendarEvent(
    token,
    ev as SuggestedEvent,
    time_zone,
    `Added from KRZ OneBox · conversation with ${convo.title}`,
  );
  await sb.from("calendar_adds").upsert(
    {
      user_id: user.id,
      conversation_id: id,
      google_event_id: created.id,
      html_link: created.htmlLink,
      title: ev.title,
      starts_at: new Date(ev.start).toISOString(),
    },
    { onConflict: "conversation_id" },
  );
  return NextResponse.json({ ok: true, html_link: created.htmlLink });
});

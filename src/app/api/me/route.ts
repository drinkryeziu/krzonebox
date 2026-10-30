import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, requireUser } from "@/lib/supabase";
import { route } from "@/lib/http";

/** The signed-in user's own profile and preferences. Each user only ever reads and writes their own. */
export const GET = route(async () => {
  const user = await requireUser();
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const tf = meta.time_format;
  return NextResponse.json({
    me: {
      id: user.id,
      email: user.email ?? null,
      name: typeof meta.full_name === "string" ? meta.full_name : null,
      time_format: tf === "12" || tf === "24" ? tf : "24",
    },
  });
});

const Body = z.object({
  timezone: z.string().max(64).optional(),
  full_name: z.string().max(120).optional(),
  time_format: z.enum(["12", "24"]).optional(),
});

/** Saves preferences on the user's account: time zone (so the AI resolves "tomorrow at 3") and time format. */
export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
  const b = parsed.data;
  if (b.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: b.timezone });
    } catch {
      delete b.timezone;
    }
  }
  const { error } = await adminClient().auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, ...b },
  });
  if (error) throw error;
  return NextResponse.json({ ok: true });
});

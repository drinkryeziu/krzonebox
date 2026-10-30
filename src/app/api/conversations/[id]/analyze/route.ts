import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { route } from "@/lib/http";
import { loadConversation } from "@/lib/conversation";
import { analyzeConversation } from "@/lib/ai";

export const maxDuration = 60;

/** Re-runs the AI triage on demand ("Refresh summary"). */
export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await loadConversation(id, user.id);
  const insight = await analyzeConversation(id);
  return NextResponse.json({ insight });
});

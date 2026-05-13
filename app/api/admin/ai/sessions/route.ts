import { NextResponse } from "next/server";
import { createErrorResponse, requireAdminPassword } from "@/lib/auth/permissions";
import { createServiceSupabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("ai_chat_sessions")
      .select("id, model, started_at, updated_at, metadata")
      .order("updated_at", { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);
    return NextResponse.json({ sessions: data ?? [] });
  } catch (error) {
    return createErrorResponse(error, "AI_SESSIONS_FAILED");
  }
}

import { NextResponse } from "next/server";
import { createErrorResponse, requireAdminPassword } from "@/lib/auth/permissions";
import { createServiceSupabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const { id } = await context.params;
    const supabase = createServiceSupabase();

    const [sessionResult, messagesResult, toolsResult] = await Promise.all([
      supabase.from("ai_chat_sessions").select("*").eq("id", id).maybeSingle(),
      supabase.from("ai_chat_messages").select("*").eq("session_id", id).order("created_at", { ascending: true }),
      supabase.from("ai_tool_calls").select("*").eq("session_id", id).order("created_at", { ascending: true }),
    ]);

    if (sessionResult.error) throw new Error(sessionResult.error.message);
    if (messagesResult.error) throw new Error(messagesResult.error.message);
    if (toolsResult.error) throw new Error(toolsResult.error.message);
    if (!sessionResult.data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    return NextResponse.json({
      session: sessionResult.data,
      messages: messagesResult.data ?? [],
      toolCalls: toolsResult.data ?? [],
    });
  } catch (error) {
    return createErrorResponse(error, "AI_SESSION_FAILED");
  }
}

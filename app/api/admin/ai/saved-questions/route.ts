import { NextResponse } from "next/server";
import { createErrorResponse, requireAdminPassword } from "@/lib/auth/permissions";
import { createServiceSupabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request, { allowQueryPassword: false });
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("ai_saved_questions")
      .select("id,title_he,prompt_he,domain,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ questions: data ?? [] });
  } catch (error) {
    return createErrorResponse(error, "AI_SAVED_QUESTIONS_FAILED");
  }
}

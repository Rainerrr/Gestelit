import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";
import {
  requireSessionOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * GET /api/sessions/scrap-reports?sessionId=xxx
 *
 * Returns scrap reports for a specific session.
 * Used by the ScrapSection component on the work page.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "SESSION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    // Verify session belongs to authenticated worker
    await requireSessionOwnership(request, sessionId);

    const supabase = createServiceSupabase();

    const { data: reports, error } = await supabase
      .from("reports")
      .select("id, description, image_url, created_at, status")
      .eq("type", "scrap")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch scrap reports: ${error.message}`);
    }

    return NextResponse.json({ reports: reports ?? [] });
  } catch (error) {
    return createErrorResponse(error, "FETCH_SCRAP_REPORTS_FAILED");
  }
}

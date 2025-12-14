import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = createServiceSupabase();

    const { count, error } = await supabase
      .from("sessions")
      .select("id", { head: true, count: "exact" })
      .eq("station_id", id)
      .eq("status", "active");

    if (error) {
      console.error("[admin-station-active-session] error", error);
      return NextResponse.json(
        { error: "CHECK_FAILED", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ hasActiveSession: (count ?? 0) > 0 });
  } catch (error) {
    console.error("[admin-station-active-session] unexpected", error);
    return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
  }
}

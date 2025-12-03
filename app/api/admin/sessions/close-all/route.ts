import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";

export async function POST() {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
    })
    .eq("status", "active")
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: "SESSION_CLOSE_FAILED", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ closed: data?.length ?? 0 });
}



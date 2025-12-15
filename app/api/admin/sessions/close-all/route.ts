import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }
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



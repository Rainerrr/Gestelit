import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";
import { requireWorker } from "@/lib/auth/permissions";

type TakeoverPayload = {
  sessionId?: string;
  instanceId?: string;
};

/**
 * POST /api/sessions/takeover
 *
 * Claims ownership of a session for a new browser tab/device.
 * Updates the active_instance_id to the new instance.
 *
 * This allows the same worker to resume a session from a new tab,
 * while invalidating the old tab's heartbeats.
 */
export async function POST(request: Request) {
  // Authenticate worker
  const workerResult = await requireWorker(request);
  if (workerResult instanceof NextResponse) {
    return workerResult;
  }

  let payload: TakeoverPayload | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const { sessionId, instanceId } = payload ?? {};

  if (!sessionId || !instanceId) {
    return NextResponse.json(
      { error: "MISSING_FIELDS" },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabase();

  // First, verify the session belongs to this worker
  const { data: session, error: fetchError } = await supabase
    .from("sessions")
    .select("id, worker_id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchError) {
    console.error("[takeover] Failed to fetch session", fetchError);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  if (!session) {
    return NextResponse.json(
      { error: "SESSION_NOT_FOUND" },
      { status: 404 },
    );
  }

  // Verify ownership
  if (session.worker_id !== workerResult.id) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 403 },
    );
  }

  // Check if session is still active
  if (session.status !== "active") {
    return NextResponse.json(
      { error: "SESSION_NOT_ACTIVE" },
      { status: 409 },
    );
  }

  // Update the active instance ID
  const timestamp = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      active_instance_id: instanceId,
      last_seen_at: timestamp,
    })
    .eq("id", sessionId);

  if (updateError) {
    console.error("[takeover] Failed to update session", updateError);
    return NextResponse.json(
      { error: "UPDATE_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

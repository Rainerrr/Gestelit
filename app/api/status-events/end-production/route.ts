import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/client";
import {
  requireSessionOwnership,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * End Production Status Endpoint
 *
 * Atomically ends a production status event with quantity reporting
 * and transitions to the next status.
 *
 * This calls the end_production_status_atomic RPC function which:
 * 1. Updates the current status_events row with quantities, ended_at,
 *    job_item_id, and job_item_step_id (records production context)
 * 2. Creates new status event for the next status
 * 3. Updates sessions.current_status_id
 * 4. Updates WIP balances via update_session_quantities_atomic_v4
 */

type EndProductionPayload = {
  sessionId: string;
  statusEventId: string;
  quantityGood: number;
  quantityScrap: number;
  nextStatusId: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | EndProductionPayload
    | null;

  // Validate payload
  if (
    !body?.sessionId ||
    !body.statusEventId ||
    !body.nextStatusId ||
    typeof body.quantityGood !== "number" ||
    typeof body.quantityScrap !== "number"
  ) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  // Validate non-negative quantities
  if (body.quantityGood < 0 || body.quantityScrap < 0) {
    return NextResponse.json(
      { error: "INVALID_QUANTITIES", message: "Quantities must be non-negative" },
      { status: 400 }
    );
  }

  try {
    // Verify session belongs to authenticated worker
    await requireSessionOwnership(request, body.sessionId);

    const supabase = createServiceSupabase();

    // Call the atomic RPC function
    const { data, error } = await supabase.rpc("end_production_status_atomic", {
      p_session_id: body.sessionId,
      p_status_event_id: body.statusEventId,
      p_quantity_good: body.quantityGood,
      p_quantity_scrap: body.quantityScrap,
      p_next_status_id: body.nextStatusId,
    });

    if (error) {
      // Handle specific error codes from the RPC function
      if (error.message.includes("SESSION_NOT_FOUND")) {
        return NextResponse.json(
          { error: "SESSION_NOT_FOUND", message: "Session not found" },
          { status: 404 }
        );
      }
      if (error.message.includes("STATUS_EVENT_NOT_FOUND")) {
        return NextResponse.json(
          { error: "STATUS_EVENT_NOT_FOUND", message: "Status event not found" },
          { status: 404 }
        );
      }
      if (error.message.includes("STATUS_EVENT_SESSION_MISMATCH")) {
        return NextResponse.json(
          { error: "STATUS_EVENT_SESSION_MISMATCH", message: "Status event does not belong to session" },
          { status: 400 }
        );
      }
      if (error.message.includes("STATUS_EVENT_ALREADY_ENDED")) {
        return NextResponse.json(
          { error: "STATUS_EVENT_ALREADY_ENDED", message: "Status event has already ended" },
          { status: 400 }
        );
      }
      // Handle WIP update errors from update_session_quantities_atomic_v4
      if (error.message.includes("WIP_UPDATE_FAILED: JOB_ITEM_STEP_NOT_FOUND")) {
        return NextResponse.json(
          {
            error: "JOB_ITEM_STEP_NOT_FOUND",
            message: "Job item step not found for this session. The job item pipeline may have been modified."
          },
          { status: 400 }
        );
      }
      if (error.message.includes("WIP_UPDATE_FAILED: WIP_BALANCE_NOT_FOUND")) {
        return NextResponse.json(
          {
            error: "WIP_BALANCE_NOT_FOUND",
            message: "WIP balance record not found. The job item may need to be reinitialized."
          },
          { status: 400 }
        );
      }
      if (error.message.includes("WIP_UPDATE_FAILED")) {
        // Generic WIP error
        const errorCode = error.message.match(/WIP_UPDATE_FAILED:\s*(\w+)/)?.[1] || "UNKNOWN";
        return NextResponse.json(
          {
            error: "WIP_UPDATE_FAILED",
            message: `Failed to update WIP balances: ${errorCode}`
          },
          { status: 400 }
        );
      }

      // Wrap Supabase error in a proper Error to preserve the message
      throw new Error(error.message || "Database error");
    }

    // RPC returns JSONB: { newStatusEvent: { id, session_id, ... } }
    // Unwrap to return flat structure expected by client
    return NextResponse.json({
      success: true,
      newStatusEvent: data?.newStatusEvent ?? null,
    });
  } catch (error) {
    return createErrorResponse(error, "END_PRODUCTION_FAILED");
  }
}

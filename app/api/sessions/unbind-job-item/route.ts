import { NextResponse } from "next/server";
import { unbindJobItemFromSession } from "@/lib/data/sessions";
import {
  requireWorker,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * POST /api/sessions/unbind-job-item
 *
 * Unbinds the current job item from a session.
 * Clears job_id, job_item_id, job_item_step_id, and current_job_item_started_at.
 *
 * Request body:
 * - sessionId: string - The session to unbind from
 */
export async function POST(request: Request) {
  try {
    await requireWorker(request);

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "SESSION_ID_REQUIRED" },
        { status: 400 },
      );
    }

    const { session, newStatusEventId } = await unbindJobItemFromSession(sessionId);
    return NextResponse.json({ success: true, session, newStatusEventId });
  } catch (error) {
    console.error("[unbind-job-item] Error:", error);
    return createErrorResponse(error, "UNBIND_JOB_ITEM_FAILED");
  }
}

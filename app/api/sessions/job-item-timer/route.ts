import { NextResponse } from "next/server";
import { getJobItemAccumulatedTime } from "@/lib/data/sessions";
import {
  requireWorker,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * GET /api/sessions/job-item-timer?sessionId=...&jobItemId=...
 *
 * Returns accumulated time (seconds) for a job item within a session,
 * plus the current segment start timestamp for live timer calculation.
 */
export async function GET(request: Request) {
  try {
    await requireWorker(request);

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const jobItemId = searchParams.get("jobItemId");

    if (!sessionId || !jobItemId) {
      return NextResponse.json(
        { error: "sessionId and jobItemId required" },
        { status: 400 },
      );
    }

    const timer = await getJobItemAccumulatedTime(sessionId, jobItemId);
    return NextResponse.json(timer);
  } catch (error) {
    console.error("[job-item-timer] Error:", error);
    return createErrorResponse(error, "JOB_ITEM_TIMER_FAILED");
  }
}

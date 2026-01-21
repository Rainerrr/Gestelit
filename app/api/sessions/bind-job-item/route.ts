import { NextResponse } from "next/server";
import { bindJobItemToSession } from "@/lib/data/sessions";
import {
  requireWorker,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * POST /api/sessions/bind-job-item
 *
 * Binds a job item to an existing session.
 * Called when worker enters production status and selects a job + job item.
 *
 * Request body:
 * - sessionId: string - The session to update
 * - jobId: string - The selected job
 * - jobItemId: string - The specific job item to work on
 * - jobItemStepId: string - The job_item_steps row linking item to station
 * - jobItemStationId: string - (deprecated) Alias for jobItemStepId
 */
export async function POST(request: Request) {
  try {
    // Verify worker is authenticated
    await requireWorker(request);

    const body = await request.json();
    const { sessionId, jobId, jobItemId, jobItemStepId, jobItemStationId } = body;

    // Support both new and deprecated parameter names
    const stepId = jobItemStepId ?? jobItemStationId;

    // Validate required fields
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "SESSION_ID_REQUIRED" },
        { status: 400 },
      );
    }

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json(
        { error: "JOB_ID_REQUIRED" },
        { status: 400 },
      );
    }

    if (!jobItemId || typeof jobItemId !== "string") {
      return NextResponse.json(
        { error: "JOB_ITEM_ID_REQUIRED" },
        { status: 400 },
      );
    }

    if (!stepId || typeof stepId !== "string") {
      return NextResponse.json(
        { error: "JOB_ITEM_STEP_ID_REQUIRED" },
        { status: 400 },
      );
    }

    const session = await bindJobItemToSession(
      sessionId,
      jobId,
      jobItemId,
      stepId,
    );

    return NextResponse.json({ session });
  } catch (error) {
    console.error("[bind-job-item] Error:", error);
    return createErrorResponse(error, "BIND_JOB_ITEM_FAILED");
  }
}
